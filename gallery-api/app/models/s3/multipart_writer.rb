module S3
  # Buffers zip bytes and flushes them to S3 as multipart upload parts.
  # Each part (except the last) must be at least 5 MB — the S3 minimum.
  class MultipartWriter
    MIN_PART_SIZE = 5 * 1024 * 1024

    attr_reader :completed_parts

    def initialize(s3_client, bucket, key, upload_id)
      @s3_client = s3_client
      @bucket = bucket
      @key = key
      @upload_id = upload_id
      @buffer = +""
      @completed_parts = []
      @part_number = 1
    end

    def <<(data)
      @buffer << data
      flush_part if @buffer.bytesize >= MIN_PART_SIZE
      self
    end

    def flush
      flush_part if @buffer.bytesize > 0
    end

    private

    def flush_part
      resp = @s3_client.upload_part(
        bucket: @bucket, key: @key, upload_id: @upload_id,
        part_number: @part_number, body: @buffer
      )
      @completed_parts << { part_number: @part_number, etag: resp.etag }
      @part_number += 1
      @buffer = +""
    end
  end
end
