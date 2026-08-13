FactoryBot.define do
  factory :image_embedding do
    association :image
    model_id { "clip-vit-b-32/openai/v1" }
    dimensions { ImageEmbedding.column_dimensions }

    # A unit vector, because the model rejects anything else. Built from the column's own
    # width so the factory cannot drift from a migration.
    embedding do
      width = ImageEmbedding.column_dimensions
      Array.new(width) { 1.0 / Math.sqrt(width) }
    end
  end
end
