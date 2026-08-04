// Mirrors backend/src/utils/visaSchemas.js's passengerSchema so obviously-bad dates are caught
// before the round trip — the backend re-validates (and owns the real refine messages).

export function emptyPassenger() {
  return {
    _key: crypto.randomUUID(),
    fullName: '',
    gender: 'Male',
    // Which of the product's two fees this passenger is charged at. Defaults to ADULT because
    // that is the common case and because it is the safer default: it never under-charges.
    passengerType: 'ADULT',
    dob: '',
    nationality: '',
    passportNumber: '',
    passportExpiry: '',
    travelDate: '',
    returnDate: '',
  };
}

export function validatePassengers(passengers) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const errors = passengers.map((p) => {
    const e = {};
    if (!p.fullName.trim()) e.fullName = 'Required';
    if (!p.nationality.trim()) e.nationality = 'Required';
    if (!p.passportNumber.trim()) e.passportNumber = 'Required';

    if (!p.dob) e.dob = 'Required';
    else if (new Date(p.dob) > today) e.dob = 'Cannot be in the future';

    if (!p.travelDate) e.travelDate = 'Required';

    if (!p.returnDate) e.returnDate = 'Required';
    else if (p.travelDate && p.returnDate < p.travelDate) e.returnDate = 'Cannot be before travel date';

    if (!p.passportExpiry) e.passportExpiry = 'Required';
    else if (p.travelDate && p.passportExpiry <= p.travelDate) {
      e.passportExpiry = 'Must be after the travel date';
    }

    return e;
  });

  const hasErrors = errors.some((e) => Object.keys(e).length > 0);
  return { errors, hasErrors };
}

export function passengerPayload(p) {
  return {
    fullName: p.fullName.trim(),
    gender: p.gender,
    passengerType: p.passengerType ?? 'ADULT',
    dob: p.dob,
    nationality: p.nationality.trim(),
    passportNumber: p.passportNumber.trim(),
    passportExpiry: p.passportExpiry,
    travelDate: p.travelDate,
    returnDate: p.returnDate,
  };
}
