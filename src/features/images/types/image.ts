export type Image = {
  id: number;
  title: string;
  description: string | null;
  tags: string[];
  s3_key: string;
  album_id: number;
  created_at: string;
  url: string; // 1-hour presigned GET URL, embedded by the serializer
};

export type UpdateImagePayload = {
  title?: string;
  description?: string;
  tags?: string[];
  album_id?: number;
};
