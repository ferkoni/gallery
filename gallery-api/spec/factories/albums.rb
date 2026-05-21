FactoryBot.define do
  factory :album do
    sequence(:name) { |n| "Album #{n}" }
    description { "A test album" }
    association :user
  end
end
