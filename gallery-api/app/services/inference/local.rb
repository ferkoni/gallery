require "net/http"
require "json"
require "base64"

module Inference
  # Talks HTTP to the CLIP sidecar (05). Holds no model, imports no ML library, and
  # keeps Rails free of Python and CUDA entirely.
  #
  # Deliberately a thin client over stdlib Net::HTTP: no new gem, and the whole class
  # is testable by stubbing one private method, so the Rails suite never needs a model.
  class Local < Base
    # The sidecar's contract is batch-shaped from the start (05) — single-item calls
    # are a batch of one. Retrofitting batching later would change the wire format and
    # every caller, and the backfill in 06 needs it.
    def initialize(endpoint:, timeout: 10)
      raise ArgumentError, "INFERENCE_MODE=local requires INFERENCE_ENDPOINT" if endpoint.blank?

      @endpoint = URI.parse(endpoint.to_s.chomp("/"))
      @timeout = timeout
    end

    def embed_text(str)
      first_embedding(post("/embed/text", texts: [ str ]))
    end

    def model_id = health.fetch("model_id")

    def dimensions = health.fetch("dimensions")

    # A question, not an assertion: any failure to reach the sidecar means "not
    # available" rather than an exception, so callers can fall back to lexical search.
    # Memoizing this would cache a restarting sidecar as permanently dead.
    def available?
      health(reload: true).present?
    rescue Error
      false
    end

    private

    def perform_embed_image(io)
      first_embedding(post("/embed/image", images: [ Base64.strict_encode64(io.read) ]))
    end

    # model_id and dimensions come from the response that produced the vector, not
    # from local config (05): a sidecar swapped underneath a running Rails cannot
    # then mislabel rows.
    def first_embedding(body)
      vector = body.fetch("embeddings").first
      raise Unavailable, "sidecar returned no embeddings" if vector.nil?

      Embedding.new(
        vector: vector,
        model_id: body.fetch("model_id"),
        dimensions: body.fetch("dimensions")
      )
    end

    def health(reload: false)
      @health = nil if reload
      @health ||= get("/health")
    end

    def get(path) = request(Net::HTTP::Get.new(path))

    def post(path, **payload)
      req = Net::HTTP::Post.new(path, "Content-Type" => "application/json")
      req.body = payload.to_json
      request(req)
    end

    # The single seam every test stubs. Maps transport and status failures onto the
    # taxonomy in inference.rb, because 06 branches on the class rather than the text.
    def request(req)
      response = http.request(req)
      handle(response)
    rescue Net::OpenTimeout, Net::ReadTimeout, SystemCallError, IOError, SocketError => e
      # Transport-level: the sidecar is down, restarting, or unreachable. Retry unchanged.
      raise Unavailable, "sidecar at #{@endpoint} unreachable: #{e.class}: #{e.message}"
    end

    def handle(response)
      case response
      when Net::HTTPSuccess       then JSON.parse(response.body)
      when Net::HTTPInsufficientStorage
        # 507 is the sidecar's OOM signal. Retryable, but only with a smaller batch,
        # which is why it is a distinct class rather than another Unavailable.
        raise OutOfMemory, "sidecar out of memory"
      when Net::HTTPClientError
        # 4xx: the payload is the problem. Never retryable — it fails identically forever.
        raise InvalidInput, "sidecar rejected the request: #{response.code} #{response.body}"
      else
        raise Unavailable, "sidecar error: #{response.code}"
      end
    rescue JSON::ParserError => e
      raise Unavailable, "sidecar returned malformed JSON: #{e.message}"
    end

    def http
      Net::HTTP.new(@endpoint.host, @endpoint.port).tap do |h|
        h.use_ssl = @endpoint.scheme == "https"
        h.open_timeout = @timeout
        h.read_timeout = @timeout
      end
    end
  end
end
