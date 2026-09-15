class AlbumSerializer
  include JSONAPI::Serializer

  attributes :id, :name, :description, :parent_id, :created_at

  # Root first, excluding the folder itself. show pays for one walk; an index under ?q=
  # passes the whole page's ancestors, computed in one query.
  attribute :ancestors, if: proc { |_album, params| params[:ancestors] } do |album, params|
    params[:ancestor_map]&.fetch(album.id, nil) || Albums::Tree.ancestors(album)
  end
end
