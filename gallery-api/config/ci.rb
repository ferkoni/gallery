# Run using bin/ci
#
# These steps mirror .github/workflows/gallery-api-ci.yml. Keep them in step: the
# value of bin/ci is that a green run locally means a green run on the PR, and a
# local suite that checks something different from the real one is just a slower
# way to be surprised.

CI.run do
  step "Setup", "bin/setup --skip-server"

  step "Style: Ruby", "bin/rubocop"

  step "Security: Gem audit", "bin/bundler-audit"
  step "Security: Brakeman code analysis", "bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error"

  step "Tests: RSpec", "bundle exec rspec"
  step "Tests: Seeds", "env RAILS_ENV=test bin/rails db:seed:replant"

  # No other step loads config/environments/production.rb, so anything it names —
  # the Active Job adapter, the cache store, the Action Cable backend — is
  # unverified until a container starts. A queue adapter that no bundled gem
  # provided shipped undetected exactly this way (#21). Needs no database: boot
  # resolves the adapter constant without connecting.
  #
  # The dummy keys are the same throwaway values the workflow uses. They unlock
  # nothing — production reads its real keys from .env — but Active Record refuses
  # to finish initializing without them present.
  step "Boot: Production environment",
       "env RAILS_ENV=production " \
       "SECRET_KEY_BASE=dummy_key_for_boot_check_only " \
       "ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY=dummy_primary_key_for_boot_check " \
       "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY=dummy_deterministic_key_boot " \
       "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT=dummy_derivation_salt_boot " \
       'bin/rails runner \'puts "production boots, Active Job adapter=#{ActiveJob::Base.queue_adapter.class}"\''

  # Optional: set a green GitHub commit status to unblock PR merge.
  # Requires the `gh` CLI and `gh extension install basecamp/gh-signoff`.
  # if success?
  #   step "Signoff: All systems go. Ready for merge and deploy.", "gh signoff"
  # else
  #   failure "Signoff: CI failed. Do not merge or deploy.", "Fix the issues and try again."
  # end
end
