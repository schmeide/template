import { useHashPath } from "../App.tsx";
import { BookingDetail } from "./BookingDetail.tsx";
import { Calendar } from "./Calendar.tsx";
import { Hours } from "./Hours.tsx";
import { NewBooking } from "./NewBooking.tsx";
import { Settings } from "./Settings.tsx";
import "./bookings.css";

const views = [
  { path: "", title: "Calendar" },
  { path: "new", title: "New booking" },
  { path: "hours", title: "Hours" },
  { path: "settings", title: "Resources and services" },
] as const;

// #/bookings (the calendar), #/bookings/new, #/bookings/hours, #/bookings/settings and
// #/bookings/<id>. The public page is #/book.
export function Bookings() {
  const [, first = ""] = useHashPath();
  const id = Number(first);
  const view =
    first === "new" ? (
      <NewBooking />
    ) : first === "hours" ? (
      <Hours />
    ) : first === "settings" ? (
      <Settings />
    ) : first && Number.isInteger(id) ? (
      <BookingDetail key={id} id={id} />
    ) : (
      <Calendar />
    );

  return (
    <>
      <nav aria-label="Booking views" className="booking-views">
        <ul>
          {views.map(({ path, title }) => (
            <li key={path}>
              <a
                href={path ? `#/bookings/${path}` : "#/bookings"}
                aria-current={path === first ? "page" : undefined}
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {view}
    </>
  );
}
