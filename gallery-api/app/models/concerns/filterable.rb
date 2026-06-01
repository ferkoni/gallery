module Filterable
  extend ActiveSupport::Concern

  class_methods do
    def from_date(date)
      where("created_at >= ?", date)
    end
  end
end
