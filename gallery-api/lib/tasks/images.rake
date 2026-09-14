# Thumbnails for an existing library. Every upload since thumbnails shipped already has
# one; these tasks are for the images uploaded before that.
#
# In a self-hosted install: docker compose exec api bin/rails images:backfill_thumbnails
namespace :images do
  desc "Generate a thumbnail for every image that has none"
  task backfill_thumbnails: :environment do
    total = Image.without_thumbnail.count

    if total.zero?
      puts "Nothing to do: every image already has a thumbnail."
      next
    end

    puts "Generating thumbnails for #{total} image(s)..."
    summary = Images::ThumbnailBackfill.call

    puts "#{summary.generated} generated, #{summary.failed} failed, " \
         "#{summary.skipped} skipped (no S3 credentials)."
    puts "Failed images keep showing their original in the grid; re-run to retry them." if summary.failed.positive?
    puts "Progress: bin/rails images:thumbnail_status"
  end

  desc "Report how many images have a thumbnail"
  task thumbnail_status: :environment do
    # Derived, not stored, like inference:status: there is no counter to drift.
    total = Image.count
    remaining = Image.without_thumbnail.count

    puts "#{total - remaining}/#{total} images have a thumbnail, #{remaining} remaining."
  end
end
