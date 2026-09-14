export type Image = {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  s3_key: string;
  album_id: number;
  favorited: boolean;
  created_at: string;
  url: string; // 1-hour presigned GET URL for the original, embedded by the serializer. The lightbox shows this.
  thumbnail_url: string; // Same, for the 400x400 grid thumbnail; the original when the image has none yet
};

export type UpdateImagePayload = {
  title?: string;
  description?: string;
  tags?: string[];
  album_id?: number;
  favorited?: boolean;
};
