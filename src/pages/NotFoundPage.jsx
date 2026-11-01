import { ButtonLink } from '../components/Button.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

export default function NotFoundPage() {
  return (
    <EmptyState title="Page not found" actions={<ButtonLink to="/">Go home</ButtonLink>}>
      The address you opened does not exist in this app.
    </EmptyState>
  );
}
