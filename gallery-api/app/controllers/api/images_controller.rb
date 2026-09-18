class Api::ImagesController < ApplicationController
  include BaseApi

  before_action :authorize_resource!, only: %i[show update destroy]
  # After authorization, so someone else's photo is still a 403 whatever the caller's
  # credentials (docs: photos-without-credentials/02, decision 3).
  before_action :require_storage!, only: %i[index show update]

  # POST /api/v1/images
  # Expects multipart/form-data with:
  #   image[file]      — the file itself
  #   image[title]     — display name (optional, defaults to filename)
  #   image[album_id]  — which album to file it under
  def create
    # The same guard #update applies to the same parameter. Without it an album_id is
    # only checked for existence (Image belongs_to :album), so an image could be filed
    # into another user's album: invisible to that user, but swept up by
    # Images::AlbumDestroy when they delete the album — which cascades away the OWNER's
    # row while the S3 delete runs against the wrong bucket and silently does nothing.
    #
    # Album.with_user raises RecordNotFound → 404 via BaseApi, which also declines to
    # confirm that somebody else's album exists.
    #
    # Here rather than inside Images::Upload because that service uploads the bytes
    # before it saves the row: rejecting at the controller means a bad request writes
    # nothing to S3 at all, rather than writing and rolling back.
    Album.with_user(current_user).find(params.dig(:image, :album_id))

    result = Images::Upload.call(
      user: current_user,
      storage: S3::Storage.for(current_user.s3_credential),
      file: params.require(:image).require(:file),
      title: params.dig(:image, :title),
      album_id: params.dig(:image, :album_id)
    )

    if result.success?
      render json: serializer.new(result.record, params: serializer_params)
                             .serializable_hash.to_json, status: :created
    else
      render json: { errors: result.error }, status: :unprocessable_content
    end
  end

  # PATCH /api/v1/images/:id
  # Updates metadata (title, description, tags, album_id). The S3 object is never
  # touched. If album_id is supplied it must belong to the current user; otherwise
  # Album.with_user raises RecordNotFound → 404 via BaseApi rescue.
  def update
    if (new_album_id = resource_params[:album_id])
      Album.with_user(current_user).find(new_album_id)
    end
    resource.update!(resource_params)
    render json: serializer.new(resource, params: serializer_params)
                           .serializable_hash.to_json
  end

  # DELETE /api/v1/images/:id
  # Delegates to Images::Destroy, which deletes the S3 object first and
  # only then destroys the DB record. If S3 fails the DB record is untouched
  # and a 422 is returned. If S3 succeeds but DB destroy fails (near-impossible),
  # the s3_key is logged and a 422 is returned. Missing credentials → 422.
  def destroy
    result = Images::Destroy.call(
      image: resource,
      storage: S3::Storage.for(current_user.s3_credential)
    )

    if result.success?
      head :no_content
    else
      render json: { errors: result.error }, status: :unprocessable_content
    end
  end

  # PATCH /api/v1/images/move   { ids: [1, 2, 3], album_id: 7 }
  # 204 when every photo moved. 404 when the folder, or any photo, isn't the user's or is gone,
  # and then nothing moved: a batch can't say which without confirming that the rest exist.
  # 422 for an empty or oversized list.
  #
  # Not in the authorize_resource! before_action: ownership is the with_user scopes, as for
  # #index. The local is `target` because #album already names the filter's folder.
  def move
    # find(nil) raises too, so a missing album_id is a 404 like someone else's folder.
    target = Album.with_user(current_user).find(params[:album_id])
    result = Images::Move.call(user: current_user, ids: params[:ids], album: target)

    if result.success?
      head :no_content
    elsif result.error == Images::Move::NOT_FOUND
      render_not_found_response
    else
      render json: { errors: result.error }, status: :unprocessable_content
    end
  end

  protected

  # GET /api/v1/images?album_id=&page=          — the album and everything under it
  # GET /api/v1/albums/:album_id/images?page=   — that album exactly
  # Scoped to the current user; album-filtered when :album_id is present.
  # album raises RecordNotFound (→ 404) if the album doesn't exist or belongs
  # to another user, so no images from other users can ever leak.
  #
  # id breaks created_at ties, so every page has a total order: Search and Favourites load
  # page after page into one list, and OFFSET over a tie can repeat or skip a photo. ?q=
  # replaces this order with its ranking (Images::Search#order_by_ids).
  def resources
    scope = Image.with_user(current_user).includes(:album).order(created_at: :desc, id: :desc)
    scope = scope.where(album_id: album_ids) if album
    scope = scope.where(favorited: true) if params[:favorited] == "true"
    apply_filters(scope).page(params[:page])
  end

  def apply_filters(scope)
    scope = scope.global_search(params[:q]) if params[:q].present?
    scope = scope.search_by_title(params[:title]) if params[:title].present?
    scope = scope.search_by_tag(params[:tag]) if params[:tag].present?
    scope = scope.from_date(params[:from]) if params[:from].present?
    scope
  end

  # The nested route sets album_scope: "direct" as a routing default. A client may send
  # ?album_scope=direct on the flat route too; that only narrows its own results.
  def album_ids
    params[:album_scope] == "direct" ? album.id : Albums::Tree.subtree_ids(album)
  end

  def album
    return nil unless params[:album_id]
    @album ||= Album.with_user(current_user).find(params[:album_id])
  end

  # The gateway is nil until the user saves credentials — the state of every new account, and
  # of anyone who deleted theirs from the Settings page. Every action that serializes a photo
  # presigns, so without a gateway it answers what #create and #destroy already answer for the
  # same state. Before #update's save, not after it, so a refused edit writes nothing.
  #
  # Tests the gateway rather than the credential: that is what presigning needs, and it is
  # what api_routes_spec stubs (docs: photos-without-credentials/02, decisions 1–3).
  def require_storage!
    render json: { errors: "No S3 credentials on file" }, status: :unprocessable_content unless storage
  end

  def storage = @storage ||= S3::Storage.for(current_user.s3_credential)

  # Passes the presigned-URL credential to the serializer. Only reached through an action
  # require_storage! has already let through, or #create once Images::Upload succeeded — which
  # it cannot without a gateway.
  # Presigning is a local crypto operation — no S3 network call is made per image.
  def serializer_params
    { presigner: storage.presigner, bucket: storage.bucket }
  end

  def resource_class = Image
  def serializer = ImageSerializer
  def resource_params = params.require(:image).permit(:title, :description, :album_id, :favorited, tags: [])
  def new_resource_params = resource_params.merge(user: current_user)
end
