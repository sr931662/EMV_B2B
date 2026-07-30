import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui';

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <Card className="w-full max-w-sm text-center">
        <p className="text-sm font-semibold text-primary-600">404</p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-500">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link to="/" className="mt-6 inline-block">
          <Button variant="outline" size="sm">
            Go home
          </Button>
        </Link>
      </Card>
    </div>
  );
}

export default NotFoundPage;
