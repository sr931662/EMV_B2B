const asyncHandler = require('../utils/asyncHandler');
const itineraryService = require('../services/itineraryService');
const dayEventService = require('../services/dayEventService');

/** The whole day-wise itinerary for a package, optionally resolved onto a travel date. */
const getItinerary = asyncHandler(async (req, res) => {
  const itinerary = await itineraryService.getPackageItinerary(req.params.id, {
    travelDate: req.validatedQuery?.travelDate,
  });

  res.status(200).json({ itinerary });
});

const listDayEvents = asyncHandler(async (req, res) => {
  const events = await dayEventService.list(req.params.dayId);

  res.status(200).json({ count: events.length, events });
});

const replaceDayEvents = asyncHandler(async (req, res) => {
  const events = await dayEventService.replaceAll(req.params.dayId, req.body.events);

  res.status(200).json({ message: 'Itinerary day saved', count: events.length, events });
});

module.exports = { getItinerary, listDayEvents, replaceDayEvents };
