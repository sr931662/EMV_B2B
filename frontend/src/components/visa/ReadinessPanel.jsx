import { Alert } from '../ui';

/** Blunt "can we pay yet" panel — driven by the request's own documentReadiness. */
function ReadinessPanel({ readiness }) {
  if (readiness.readyToSubmit) {
    return (
      <Alert variant="success" title="Ready for payment">
        All required documents have been uploaded for every passenger.
      </Alert>
    );
  }

  return (
    <Alert variant="warning" title="Documents missing">
      <ul className="mt-1 list-disc pl-5">
        {readiness.missing.map((m) => (
          <li key={m.passengerId}>
            {m.passengerName} still needs: {m.missingDocs.join(', ')}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

export default ReadinessPanel;
