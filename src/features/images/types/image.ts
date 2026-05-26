export type Image = {
  id: number;
  title: string;
  s3_key: string;
  album_id: number;
  created_at: string;
  url: string; // 1-hour presigned GET URL, embedded by the serializer
};
