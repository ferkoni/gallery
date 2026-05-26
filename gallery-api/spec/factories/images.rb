FactoryBot.define do
  factory :image do
    sequence(:title) { |n| "Photo #{n}" }
    sequence(:s3_key) { |n| "uploads/uuid-#{n}/photo.jpg" }
    association :album
    association :user
  end
end
