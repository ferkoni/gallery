module Images
  Result = Data.define(:success?, :record, :error)

  class Base
    def self.call(**args)
      new(**args).call
    end

    S3_ERRORS = [
      Aws::S3::Errors::ServiceError,
      Aws::Errors::MissingCredentialsError,
      Aws::Errors::NoSuchEndpointError,
      Seahorse::Client::NetworkingError
    ].freeze

    private

    def failure(message)
      Result.new(success?: false, record: nil, error: message)
    end

    def success(record: nil)
      Result.new(success?: true, record: record, error: nil)
    end
  end
end
