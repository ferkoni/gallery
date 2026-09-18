require "rails_helper"
require "rake"

# bin/rails users:create is the only way an account is made (docs: closed-signup/02,
# decisions 1–3), and install.sh branches on its exit status, so both the message and the
# status are part of its contract.
RSpec.describe "users:create" do
  before(:all) { Rails.application.load_tasks unless Rake::Task.task_defined?("users:create") }

  # Re-enabled on every call: Rake runs a task once per process unless told otherwise.
  def task = Rake::Task["users:create"].tap(&:reenable)

  # Set for one example and restored after, whatever the example does.
  def with_env(vars)
    saved = vars.keys.to_h { |key| [ key, ENV[key] ] }
    vars.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    yield
  ensure
    saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  # Runs the task expecting it to refuse: returns what it printed on stderr and its exit
  # status, and fails the example if it did not refuse.
  def refusal(env)
    stderr = StringIO.new
    original = $stderr
    $stderr = stderr
    begin
      with_env(env) { task.invoke }
      raise "expected users:create to refuse #{env.inspect}"
    rescue SystemExit => e
      [ stderr.string, e.status ]
    ensure
      $stderr = original
    end
  end

  it "creates the user and says so" do
    expect {
      with_env("EMAIL" => "owner@example.com", "PASSWORD" => "password123") { task.invoke }
    }.to output("Created owner@example.com.\n").to_stdout.and change(User, :count).by(1)

    expect(User.find_by(email: "owner@example.com").valid_password?("password123")).to be(true)
  end

  it "normalises the email as Devise does, so the owner logs in with what they typed" do
    with_env("EMAIL" => "  Owner@Example.COM ", "PASSWORD" => "password123") do
      expect { task.invoke }.to output("Created owner@example.com.\n").to_stdout
    end
  end

  it "keeps quotes and dollar signs in a password intact" do
    with_env("EMAIL" => "owner@example.com", "PASSWORD" => %q(pa"ss 'w $ord)) do
      expect { task.invoke }.to output.to_stdout
    end

    expect(User.find_by(email: "owner@example.com").valid_password?(%q(pa"ss 'w $ord))).to be(true)
  end

  describe "refusals: a sentence on stderr and exit status 1, never a backtrace" do
    it "refuses a taken email" do
      create(:user, email: "owner@example.com")

      expect(refusal("EMAIL" => "owner@example.com", "PASSWORD" => "password123"))
        .to eq([ "Could not create owner@example.com: Email has already been taken.\n", 1 ])
    end

    it "refuses a password under Devise's minimum, and writes nothing" do
      expect {
        expect(refusal("EMAIL" => "owner@example.com", "PASSWORD" => "12345"))
          .to eq([ "Could not create owner@example.com: Password is too short (minimum is 6 characters).\n", 1 ])
      }.not_to change(User, :count)
    end

    it "refuses an invalid email" do
      expect(refusal("EMAIL" => "not-an-email", "PASSWORD" => "password123"))
        .to eq([ "Could not create not-an-email: Email is invalid.\n", 1 ])
    end

    it "refuses a missing or blank EMAIL or PASSWORD" do
      [ { "EMAIL" => nil, "PASSWORD" => "password123" },
        { "EMAIL" => "owner@example.com", "PASSWORD" => nil },
        { "EMAIL" => "   ", "PASSWORD" => "password123" } ].each do |env|
        expect(refusal(env)).to eq([ "Set EMAIL and PASSWORD.\n", 1 ])
      end
    end
  end
end
