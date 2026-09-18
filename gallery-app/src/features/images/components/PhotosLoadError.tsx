import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';

type Props = {
  error: unknown;
  fallback: string; // the page's own sentence, for every other failure
  className: string;
  testId?: string;
};

// A 422 on a photo query means the user has no S3 credentials on file: the API refuses to list
// what it cannot presign (docs: photos-without-credentials/02, decisions 2 and 4). Checks the
// status, not the sentence, so rewording the API's message cannot break it.
export function PhotosLoadError({ error, fallback, className, testId }: Props) {
  const noCredentials = isAxiosError(error) && error.response?.status === 422;

  return (
    <p className={className} data-testid={testId}>
      {noCredentials ? (
        <>
          Your photos need S3 credentials.{' '}
          <Link to="/settings/s3_credential" className="text-link hover:text-link-strong font-medium">
            Add them in Settings
          </Link>
          .
        </>
      ) : (
        fallback
      )}
    </p>
  );
}
