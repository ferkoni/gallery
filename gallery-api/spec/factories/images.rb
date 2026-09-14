FactoryBot.define do
  factory :image do
    sequence(:title) { |n| "Photo #{n}" }
    sequence(:s3_key) { |n| "uploads/uuid-#{n}/photo.jpg" }
    association :user

    # The album belongs to the image's own user, which the application now requires and
    # this factory used to violate: `association :album` built an album with a user of
    # its own, so every `create(:image)` produced exactly the mis-scoped row that
    # Images::AlbumDestroy cascades away from the wrong account.
    #
    # Callers that pass an explicit album keep it; only the default changes.
    album { association :album, user: user }

    # No thumb_key by default: the shape of an image uploaded before thumbnails, which
    # is the case the fallbacks exist for. Anything uploaded since has one.
    trait :with_thumbnail do
      thumb_key { Images::Thumbnail.key_for(s3_key) }
    end
  end
end
