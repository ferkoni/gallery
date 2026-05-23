FactoryBot.define do
  factory :s3_credential do
    access_key_id     { "AKIAIOSFODNN7EXAMPLE" }
    secret_access_key { "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" }
    region            { "us-east-1" }
    bucket            { "my-gallery-bucket" }
    association :user
  end
end
