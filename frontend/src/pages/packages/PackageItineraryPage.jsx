import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Icon, Skeleton } from '../../components/ui';
import MarkdownContent from '../../components/shared/MarkdownContent';
import { apiGet, ApiError } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/format';
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_ICONS,
  MEAL_LABELS,
  formatDuration,
  formatTimeRange,
  starsOutOfFive,
  describeRefundable,
} from '../../lib/itinerary';
import { VISA_CATEGORY_LABELS, ENTRY_TYPE_LABELS } from '../../lib/visaProducts';

/**
 * The day-wise itinerary view.
 *
 * A package is a template with times of day but no dates. Pass ?travelDate= and the server
 * resolves every day onto the calendar, so the same page serves both "what does this trip look
 * like" and "what does it look like for a 5 November departure".
 */

function MealChips({ meals }) {
  if (!meals?.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {meals.map((m) => (
        <Badge key={m} variant="neutral">
          {MEAL_LABELS[m] ?? m}
        </Badge>
      ))}
    </div>
  );
}

function EventRow({ event, nested = false }) {
  const timeRange = formatTimeRange(event.startTime, event.endTime);
  const duration = formatDuration(event.durationMinutes);

  return (
    <li className={nested ? 'border-l border-neutral-200 pl-4' : ''}>
      <div className="flex gap-3">
        <span
          className={`mt-0.5 flex shrink-0 items-center justify-center rounded-lg ${
            nested ? 'size-6 bg-neutral-100 text-neutral-500' : 'size-8 bg-primary-50 text-primary-600'
          }`}
        >
          <Icon name={EVENT_TYPE_ICONS[event.type] ?? 'sparkles'} size={nested ? 12 : 15} />
        </span>

        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            {timeRange && (
              <span className="font-mono text-[12px] text-neutral-500 tabular-nums">{timeRange}</span>
            )}
            <span className={nested ? 'text-[13px] text-neutral-800' : 'text-[14px] font-medium text-neutral-900'}>
              {event.title}
            </span>
            {!nested && <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type] ?? event.type}</Badge>}
            {duration && <span className="text-[12px] text-neutral-400">{duration}</span>}
          </div>

          {event.description && (
            <p className="mt-1 text-[13px] leading-6 text-neutral-600">{event.description}</p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <MealChips meals={event.mealsIncluded} />
            {event.availability && (
              <span className="text-[12px] text-neutral-500">{event.availability}</span>
            )}
          </div>

          {/* Transfer detail only renders for transfers — every other event type leaves these null. */}
          {(event.transferMode || event.luggageAllowance) && (
            <div className="mt-2 flex flex-wrap gap-4 rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-600">
              {event.transferMode && (
                <span>
                  <span className="text-neutral-400">Vehicle:</span> {event.transferMode}
                </span>
              )}
              {event.luggageAllowance && (
                <span>
                  <span className="text-neutral-400">Luggage:</span> {event.luggageAllowance}
                </span>
              )}
            </div>
          )}

          {event.subEvents?.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {event.subEvents.map((sub) => (
                <EventRow key={sub.id} event={sub} nested />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function HotelCard({ hotel }) {
  const stars = starsOutOfFive(hotel.starRating);
  const refundable = describeRefundable(hotel.refundable);

  return (
    <div className="surface overflow-hidden rounded-xl">
      {hotel.coverImageUrl && (
        <img src={hotel.coverImageUrl} alt="" aria-hidden="true" loading="lazy" className="h-32 w-full object-cover" />
      )}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold text-neutral-900">{hotel.hotelName}</p>
          {stars && <span className="text-[13px] text-amber-500">{stars}</span>}
          <Badge variant="neutral">{hotel.hotelCategory}</Badge>
        </div>

        {hotel.googleRating !== null && hotel.googleRating !== undefined && (
          <p className="text-[12px] text-neutral-500">
            Google {hotel.googleRating}
            {hotel.googleRatingCount ? ` · ${hotel.googleRatingCount} reviews` : ''}
          </p>
        )}

        {hotel.hotelAddress && <p className="text-[13px] text-neutral-600">{hotel.hotelAddress}</p>}
        {hotel.hotelPhone && (
          <p className="flex items-center gap-1 text-[13px] text-neutral-600">
            <Icon name="phone" size={13} className="text-neutral-400" />
            {hotel.hotelPhone}
          </p>
        )}

        {hotel.mapLink && (
          <a
            href={hotel.mapLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-primary-600 hover:text-primary-700"
          >
            <Icon name="map-pin" size={13} />
            View on map
          </a>
        )}

        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
          {hotel.checkInTime && (
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Check in</dt>
              <dd className="text-neutral-800">{hotel.checkInTime}</dd>
            </div>
          )}
          {hotel.checkOutTime && (
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Check out</dt>
              <dd className="text-neutral-800">{hotel.checkOutTime}</dd>
            </div>
          )}
          {hotel.roomType && (
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Room</dt>
              <dd className="text-neutral-800">{hotel.roomType}</dd>
            </div>
          )}
          {hotel.mealPlan && (
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">Meals</dt>
              <dd className="text-neutral-800">{hotel.mealPlan}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-500">Nights</dt>
            <dd className="text-neutral-800">{hotel.nights}</dd>
          </div>
        </dl>

        {/* Absent entirely when the admin has not stated a policy — see describeRefundable. */}
        {refundable && <Badge variant={refundable.variant}>{refundable.label}</Badge>}

        {hotel.servicesOffered && (
          <div className="mt-1">
            <p className="text-[12px] uppercase tracking-wide text-neutral-500">Services</p>
            <MarkdownContent content={hotel.servicesOffered} />
          </div>
        )}
      </div>
    </div>
  );
}

function PackageItineraryPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const travelDate = searchParams.get('travelDate') ?? '';

  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const query = travelDate ? `?travelDate=${travelDate}` : '';
    apiGet(`/api/packages/${id}/itinerary${query}`)
      .then((res) => {
        if (!cancelled) setItinerary(res.itinerary);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load the itinerary.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, travelDate]);

  if (loading) return <Skeleton.Stat />;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!itinerary) return null;

  const { package: pkg, hotels, days, visa, destinationNotes } = itinerary;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-8">
      <Link
        to={`/packages/${id}`}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-primary-600 hover:text-primary-700"
      >
        <Icon name="arrow-left" size={14} />
        Back to package
      </Link>

      <div className="surface overflow-hidden rounded-2xl">
        {pkg.gallery?.[0] && (
          <img src={pkg.gallery[0]} alt="" aria-hidden="true" className="h-44 w-full object-cover sm:h-56" />
        )}
        <div className="flex flex-wrap items-end justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-[13px] text-neutral-500">{pkg.countryName}</p>
            <h1 className="text-[22px] font-semibold leading-tight text-neutral-900 sm:text-[26px]">
              {pkg.title}
            </h1>
            <p className="mt-1 text-[14px] text-neutral-600">
              {pkg.days} days · {pkg.nights} nights
            </p>
          </div>

          {/* Resolving the template onto real dates is the difference between "day 3" and
              "Saturday 7 November", which is what a customer actually asks about. */}
          <label className="flex flex-col gap-1 text-[12px] text-neutral-500">
            Show dates for a departure
            <input
              type="date"
              min={today}
              value={travelDate}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                if (e.target.value) next.set('travelDate', e.target.value);
                else next.delete('travelDate');
                setSearchParams(next, { replace: true });
              }}
              className="h-9 rounded-lg border border-neutral-200 px-2 text-[13px] text-neutral-900"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-neutral-100 px-5 py-4 sm:px-6">
          <p className="text-[12px] uppercase tracking-wide text-neutral-500">Wholesale price (per head)</p>
          <p className="text-[18px] font-semibold text-neutral-900">
            Adult: {formatCurrency(pkg.adultRawPrice)}
          </p>
          <p className="text-[14px] text-neutral-700">
            Child: {Number(pkg.childRawPrice) === 0 ? 'Free' : formatCurrency(pkg.childRawPrice)}
          </p>
        </div>
      </div>

      {hotels.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">Where you stay</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hotels.map((h) => (
              <HotelCard key={h.id} hotel={h} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-neutral-900">Day by day</h2>

        {days.length === 0 ? (
          <Card>
            <p className="text-[13px] text-neutral-500">No itinerary days on this package yet.</p>
          </Card>
        ) : (
          days.map((day) => (
            <Card key={day.dayNumber} bodyClassName="p-0">
              {day.coverImageUrl && (
                <img src={day.coverImageUrl} alt="" aria-hidden="true" loading="lazy" className="h-32 w-full rounded-t-xl object-cover" />
              )}
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-[12px] uppercase tracking-wide text-primary-700">
                      Day {day.dayNumber}
                      {day.calendar && (
                        <span className="ml-2 text-neutral-500">
                          {formatDate(day.calendar.date)} ({day.calendar.day})
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[16px] font-semibold text-neutral-900">{day.title}</p>
                  </div>
                  {day.stayingAt && (
                    <span className="text-[12px] text-neutral-500">
                      <Icon name="building" size={12} className="mr-1 inline" />
                      {day.stayingAt.hotelName}
                    </span>
                  )}
                </div>

                {day.brief && <p className="text-[13px] leading-6 text-neutral-600">{day.brief}</p>}
                <MealChips meals={day.mealsIncluded} />

                {day.events.length > 0 && (
                  <ul className="flex flex-col gap-4">
                    {day.events.map((e) => (
                      <EventRow key={e.id} event={e} />
                    ))}
                  </ul>
                )}

                {day.description && (
                  <div className="border-t border-neutral-100 pt-3">
                    <MarkdownContent content={day.description} />
                  </div>
                )}

                {day.inclusions && (
                  <div className="rounded-lg bg-neutral-50 p-3">
                    <p className="text-[12px] uppercase tracking-wide text-neutral-500">
                      Included today
                    </p>
                    <MarkdownContent content={day.inclusions} />
                  </div>
                )}

                {/* Styled as a warning rather than buried in prose — these are the lines a
                    traveller regrets skimming. */}
                {day.notes && (
                  <Alert variant="warning">
                    <MarkdownContent content={day.notes} />
                  </Alert>
                )}
              </div>
            </Card>
          ))
        )}
      </section>

      {visa && visa.products.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">Visa for {visa.countryName}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visa.products.map((v) => (
              <div key={v.id} className="surface flex flex-col gap-2 rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold text-neutral-900">{v.name}</p>
                  <Badge variant="neutral">{VISA_CATEGORY_LABELS[v.category] ?? v.category}</Badge>
                </div>
                <p className="text-[12px] text-neutral-600">
                  {ENTRY_TYPE_LABELS[v.entryType] ?? v.entryType}
                  {v.validityDays ? ` · ${v.validityDays} days validity` : ''}
                  {v.maxStayDays ? ` · ${v.maxStayDays}-day stay` : ''}
                </p>
                <Button as={Link} to={`/visa/products/${v.id}`} variant="outline" size="sm" className="mt-auto w-fit">
                  Show visa details
                  <Icon name="chevron-right" size={13} />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Inclusions">
          <MarkdownContent content={pkg.inclusions} />
        </Card>
        <Card title="Exclusions">
          <MarkdownContent content={pkg.exclusions} />
        </Card>
      </div>

      {(destinationNotes.general || destinationNotes.toursAndTransfers) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">{pkg.countryName} notes</h2>
          {destinationNotes.general && (
            <Card>
              <MarkdownContent content={destinationNotes.general} />
            </Card>
          )}
          {destinationNotes.toursAndTransfers && (
            <Card title="Tours and transfers">
              <MarkdownContent content={destinationNotes.toursAndTransfers} />
            </Card>
          )}
        </section>
      )}

      {destinationNotes.terms?.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">Important notes and terms</h2>
          <div className="flex flex-col gap-4">
            {destinationNotes.terms.map((block) => (
              <Card key={block.key} title={block.title}>
                <MarkdownContent content={block.body} />
              </Card>
            ))}
          </div>
        </section>
      )}

      {pkg.faqs && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">FAQs</h2>
          <Card>
            <MarkdownContent content={pkg.faqs} />
          </Card>
        </section>
      )}
    </div>
  );
}

export default PackageItineraryPage;
