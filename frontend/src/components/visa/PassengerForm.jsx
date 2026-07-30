import { Button, Card, Input, Select } from '../ui';
import { emptyPassenger } from '../../lib/visaValidators';

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
];

/** Repeatable passenger rows shared by request creation and the "edit passengers" flow
 * (only while APPLICATION_SUBMITTED). Fully controlled — parent owns `passengers` state. */
function PassengerForm({ passengers, setPassengers, errors }) {
  const setField = (index, field) => (e) => {
    const { value } = e.target;
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const addPassenger = () => setPassengers((prev) => [...prev, emptyPassenger()]);
  const removePassenger = (index) => setPassengers((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-4">
      {passengers.map((p, i) => (
        <Card
          key={p._key}
          title={`Passenger ${i + 1}`}
          actions={
            passengers.length > 1 && (
              <button
                type="button"
                onClick={() => removePassenger(i)}
                className="text-sm font-medium text-danger-600 hover:text-danger-700"
              >
                Remove
              </button>
            )
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="Full name"
              required
              value={p.fullName}
              onChange={setField(i, 'fullName')}
              error={errors[i]?.fullName}
            />
            <Select
              label="Gender"
              required
              value={p.gender}
              onChange={setField(i, 'gender')}
              options={GENDER_OPTIONS}
            />
            <Input
              label="Date of birth"
              type="date"
              required
              value={p.dob}
              onChange={setField(i, 'dob')}
              error={errors[i]?.dob}
            />
            <Input
              label="Nationality"
              required
              value={p.nationality}
              onChange={setField(i, 'nationality')}
              error={errors[i]?.nationality}
            />
            <Input
              label="Passport number"
              required
              value={p.passportNumber}
              onChange={setField(i, 'passportNumber')}
              error={errors[i]?.passportNumber}
            />
            <Input
              label="Passport expiry"
              type="date"
              required
              value={p.passportExpiry}
              onChange={setField(i, 'passportExpiry')}
              error={errors[i]?.passportExpiry}
              hint={!errors[i]?.passportExpiry ? 'Must be valid past the travel date' : undefined}
            />
            <Input
              label="Travel date"
              type="date"
              required
              value={p.travelDate}
              onChange={setField(i, 'travelDate')}
              error={errors[i]?.travelDate}
            />
            <Input
              label="Return date"
              type="date"
              required
              value={p.returnDate}
              onChange={setField(i, 'returnDate')}
              error={errors[i]?.returnDate}
            />
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addPassenger} className="self-start">
        + Add another passenger
      </Button>
    </div>
  );
}

export default PassengerForm;
