class Api::AlbumsController < ApplicationController
  include BaseApi

  before_action :authorize_resource!, only: [ :show, :create, :update, :destroy ]
  before_action :guard_parent!, only: %i[create update]

  # PATCH /api/albums/:id
  # The only action that can move a folder, and so the only one that needs the tree lock.
  # resource is loaded before it, which is fine: the cycle check re-reads the tree inside
  # the lock, and ownership cannot change.
  def update
    with_tree_lock { resource.update!(resource_params) }
    render json: serializer.new(resource, params: serializer_params).serializable_hash.to_json
  end

  # DELETE /api/albums/:id
  # Delegates to Images::AlbumDestroy, which batch-deletes the S3 objects of the whole
  # subtree first and then deletes its rows. If the subtree has no images, S3 is not
  # touched. Missing credentials with images → 422, and so does a subtree that changed
  # under the service while it worked.
  #
  # Deliberately not wrapped in with_tree_lock: that would hold a transaction open across
  # an S3 round-trip. The service re-reads the subtree instead.
  def destroy
    result = Images::AlbumDestroy.call(
      album: resource,
      storage: S3::Storage.for(current_user.s3_credential)
    )

    if result.success?
      head :no_content
    else
      render json: { errors: result.error }, status: :unprocessable_content
    end
  end

  protected

  # One level of the tree, newest first — except under ?q=, which searches the user's whole
  # forest and ignores the level. Filter, then order, then paginate, so a filtered list
  # pages over the matches rather than over the first page of everything.
  #
  # Memoized because serializer_params names it too, and a page of search hits should cost
  # one query here, not two.
  def resources
    @_resources ||= begin
      scope = apply_filters(owned)
      scope = scope.where(parent_id: parent&.id) if params[:q].blank?
      scope = scope.where.not(id: Albums::Tree.subtree_ids(excluded)) if excluded
      scope.order(created_at: :desc, id: :desc).page(params[:page])
    end
  end

  # Member actions reach any folder the user owns, at any depth — not `resources`, which is
  # one level of the tree and would answer 404 for everything below it.
  def resource
    @_resource ||= params[:id] ? owned.find(params[:id]) : owned.build(new_resource_params)
  end

  def owned = Album.with_user(current_user)

  # ?parent_id= on the index: whose children to list. A stranger's folder is 404, as show is.
  def parent
    return nil if params[:parent_id].blank?

    @parent ||= owned.find(params[:parent_id])
  end

  # ?exclude_subtree= — the Location picker's own folder. Browsing a level makes descendants
  # unenterable, but a search spans the forest, so the folder being moved and everything
  # under it have to be removed from the hits or the picker would offer a cycle.
  def excluded
    return nil if params[:exclude_subtree].blank?

    @excluded ||= owned.find(params[:exclude_subtree])
  end

  # A parent the user does not own is 404, not 422: the same answer show gives for a folder
  # that is not theirs, so the API never confirms a stranger's id exists.
  def guard_parent!
    owned.find(resource_params[:parent_id]) if resource_params[:parent_id].present?
  end

  # The albums of one user must form a forest, which no constraint can express: a CHECK sees
  # one row and a foreign key one edge. A move reads the tree and then writes it, so two
  # moves by one user are serialised — otherwise each can pass a cycle check against a tree
  # the other is about to change, and the pair commits a cycle that detaches both subtrees
  # from every root. The users row is the mutex and has no other meaning; see the note on
  # User. Other users are unaffected.
  def with_tree_lock
    Album.transaction do
      User.lock.find(current_user.id)
      yield
    end
  end

  # show always carries the breadcrumb trail; a search adds one per row, because a flat list
  # of matches with duplicate sibling names is unreadable without a path. Nothing else pays
  # for it.
  def serializer_params
    return { ancestors: true } if action_name == "show"
    return {} if params[:q].blank?

    { ancestors: true, ancestor_map: Albums::Tree.ancestors_for(resources.to_a) }
  end

  # An omitted parent_id is absent from the permitted hash and leaves the folder where it
  # is; an explicit null is present and moves it to the top level.
  def resource_params
    params.require(:album).permit(:name, :description, :parent_id)
  end

  def serializer = AlbumSerializer
  def new_resource_params = resource_params
end
