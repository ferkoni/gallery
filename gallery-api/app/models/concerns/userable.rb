module Userable
  extend ActiveSupport::Concern

  included do
    belongs_to :user
  end

  class_methods do
    def with_user(user)
      where(user: user)
    end
  end
end
