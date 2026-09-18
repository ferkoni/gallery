# Accounts. There is no self-service signup (docs: closed-signup/02, decision 1), so this is
# how an install gets its first user and every one after it.
#
# In a self-hosted install, with the credentials in the calling shell's environment rather
# than on the command line:
#
#   EMAIL=you@example.com PASSWORD=... docker compose exec -T -e EMAIL -e PASSWORD api bin/rails users:create
namespace :users do
  desc "Create a user from EMAIL and PASSWORD"
  task create: :environment do
    email = ENV["EMAIL"].to_s.strip
    password = ENV["PASSWORD"].to_s
    abort "Set EMAIL and PASSWORD." if email.empty? || password.empty?

    # Through the model, so Devise's validations (format, uniqueness, length) apply, and
    # reported as a sentence rather than the backtrace User.create! would print.
    user = User.new(email: email, password: password)
    abort "Could not create #{email}: #{user.errors.full_messages.to_sentence}." unless user.save

    puts "Created #{user.email}."
  end
end
