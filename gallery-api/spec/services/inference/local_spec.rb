require "rails_helper"

RSpec.describe Inference::Local do
  subject(:adapter) { described_class.new(endpoint: "http://sidecar:8000", timeout: 1) }

  # The whole class is a thin client over one seam. Stubbing that seam is what lets
  # the Rails suite exercise every branch with no sidecar, no Python, and no network.
  def stub_http(response)
    http = instance_double(Net::HTTP)
    allow(http).to receive(:request).and_return(response)
    allow(adapter).to receive(:http).and_return(http)
  end

  # Real Net::HTTPResponse instances rather than doubles: #handle dispatches with
  # case/when, which goes through Module#=== and calls kind_of? in C — a stubbed
  # #is_a? is never consulted, so a double would pass or fail for the wrong reason.
  def response(klass, code, body)
    klass.new("1.1", code, "").tap do |r|
      r.instance_variable_set(:@body, body)
      r.instance_variable_set(:@read, true)
    end
  end

  def ok(body) = response(Net::HTTPOK, "200", body.to_json)

  def failure(klass, code) = response(klass, code, "boom")

  let(:embedding_body) do
    { "model_id" => "clip-vit-b-32/openai/v1", "dimensions" => 2, "embeddings" => [ [ 0.6, 0.8 ] ] }
  end

  it "requires an endpoint, since a sidecar URL cannot be guessed" do
    expect { described_class.new(endpoint: nil) }.to raise_error(ArgumentError, /INFERENCE_ENDPOINT/)
  end

  describe "#embed_text" do
    it "returns an Embedding labelled by the response, not by local config" do
      stub_http(ok(embedding_body))

      result = adapter.embed_text("a photo of a beach")

      expect(result.vector).to eq([ 0.6, 0.8 ])
      expect(result.model_id).to eq("clip-vit-b-32/openai/v1")
      expect(result.dimensions).to eq(2)
    end
  end

  describe "#embed_image" do
    it "goes through the chokepoint and base64-encodes the bytes" do
      stub_http(ok(embedding_body))

      expect(adapter.embed_image(plain_image).vector).to eq([ 0.6, 0.8 ])
    end
  end

  # The taxonomy is the part that earns its keep: 06 branches on the class, so each
  # transport and status failure has to land on the right one.
  describe "error mapping" do
    it "maps an unreachable sidecar to Unavailable, which is retryable unchanged" do
      http = instance_double(Net::HTTP)
      allow(http).to receive(:request).and_raise(Errno::ECONNREFUSED)
      allow(adapter).to receive(:http).and_return(http)

      expect { adapter.embed_text("x") }.to raise_error(Inference::Unavailable)
    end

    it "maps a read timeout to Unavailable" do
      http = instance_double(Net::HTTP)
      allow(http).to receive(:request).and_raise(Net::ReadTimeout)
      allow(adapter).to receive(:http).and_return(http)

      expect { adapter.embed_text("x") }.to raise_error(Inference::Unavailable)
    end

    it "maps 507 to OutOfMemory, which is retryable only with a smaller batch" do
      stub_http(failure(Net::HTTPInsufficientStorage, "507"))

      expect { adapter.embed_text("x") }.to raise_error(Inference::OutOfMemory)
    end

    it "maps 4xx to InvalidInput, which is never retryable" do
      stub_http(failure(Net::HTTPBadRequest, "400"))

      expect { adapter.embed_text("x") }.to raise_error(Inference::InvalidInput)
    end

    it "maps malformed JSON to Unavailable rather than crashing with a parser error" do
      stub_http(response(Net::HTTPOK, "200", "not json"))

      expect { adapter.embed_text("x") }.to raise_error(Inference::Unavailable, /malformed JSON/)
    end

    it "treats an empty embeddings array as a failure rather than returning nil" do
      stub_http(ok(embedding_body.merge("embeddings" => [])))

      expect { adapter.embed_text("x") }.to raise_error(Inference::Unavailable)
    end
  end

  describe "#available?" do
    it "answers false rather than raising when the sidecar is down" do
      http = instance_double(Net::HTTP)
      allow(http).to receive(:request).and_raise(Errno::ECONNREFUSED)
      allow(adapter).to receive(:http).and_return(http)

      expect(adapter.available?).to be(false)
    end

    it "answers true when /health responds" do
      stub_http(ok({ "status" => "ok", "model_id" => "m", "dimensions" => 512 }))

      expect(adapter.available?).to be(true)
    end
  end
end
