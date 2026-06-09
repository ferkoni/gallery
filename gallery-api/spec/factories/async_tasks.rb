FactoryBot.define do
  factory :async_task do
    task_type { "album_download" }
    status { "pending" }
    payload { {} }
    result { {} }
    association :user

    trait :ready do
      status { "ready" }
      result { { "url" => "https://example.com/download.zip" } }
    end

    trait :failed do
      status { "failed" }
      result { { "error" => "S3 upload failed" } }
    end
  end
end
