import { Card } from '../ui';
import DocumentUploadRow from './DocumentUploadRow';
import { formatDate } from '../../lib/format';

/** One passenger's details + their per-document upload checklist. */
function PassengerCard({ visaRequestId, passenger, requiredDocuments, onUploaded }) {
  const findUpload = (documentName) =>
    passenger.documentUploads?.find((u) => u.documentName === documentName);

  return (
    <Card title={passenger.fullName}>
      <dl className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-neutral-500">Gender</dt>
          <dd className="text-neutral-900">{passenger.gender}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Date of birth</dt>
          <dd className="text-neutral-900">{formatDate(passenger.dob)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Nationality</dt>
          <dd className="text-neutral-900">{passenger.nationality}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Passport number</dt>
          <dd className="text-neutral-900">{passenger.passportNumber}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Passport expiry</dt>
          <dd className="text-neutral-900">{formatDate(passenger.passportExpiry)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Travel date</dt>
          <dd className="text-neutral-900">{formatDate(passenger.travelDate)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Return date</dt>
          <dd className="text-neutral-900">{formatDate(passenger.returnDate)}</dd>
        </div>
      </dl>

      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Required documents
      </h4>
      <div className="flex flex-col gap-2">
        {requiredDocuments.length === 0 ? (
          <p className="text-sm text-neutral-400">No documents configured for this country.</p>
        ) : (
          requiredDocuments.map((doc) => (
            <DocumentUploadRow
              key={doc.id}
              visaRequestId={visaRequestId}
              passengerId={passenger.id}
              doc={doc}
              upload={findUpload(doc.documentName)}
              onUploaded={onUploaded}
            />
          ))
        )}
      </div>
    </Card>
  );
}

export default PassengerCard;
