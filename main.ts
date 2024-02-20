import axios from "axios";
import dayjs from "dayjs";
import { difference, max, reduce } from "ramda";

enum Floor {
  Floor26 = 1,
  Floor27 = 2,
}

enum Amenity {
  singleMonitor = 8,
  doubleMonitor = 9,
  partitionPanel = 10,
  heightAdjustable = 11,
}

enum Day {
  Sunday = 0,
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
}

export const Preferences = {
  floor: [Floor.Floor27, Floor.Floor26],
  amenity: [Amenity.doubleMonitor, Amenity.doubleMonitor],
  bookForWeekday: [Day.Monday, Day.Tuesday, Day.Wednesday],
  startHour: 9,
  endHour: 18,
} as const;

const client = axios.create({
  baseURL: "https://fujifilm.bookings.one/api",
  withCredentials: true,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    Origin: "https://fujifilm.bookings.one",
  },
});

client.interceptors.response.use(
  (response) => {
    if (response.status >= 400) {
      throw new Error(response.data.data);
    }

    return response;
  },
  (error) => {
    console.error("Axios Error", JSON.stringify(error.response?.data));

    return Promise.reject(error);
  }
);

async function main(bookingDays: Date[]) {
  await login("chak.chan.jz@fujifilm.com", "Ctc87813076");

  for (const bookingDay of bookingDays) {
    try {
      const from = dayjs(bookingDay)
        .startOf("day")
        .hour(Preferences.startHour)
        .toDate();
      const to = dayjs(bookingDay)
        .startOf("day")
        .hour(Preferences.endHour)
        .toDate();

      const availableDesks = await getAvailableDesks({
        availableStart: from,
        availableEnd: to,
      });

      if (!availableDesks || availableDesks.length === 0)
        throw new Error("No available desks");

      const desk = availableDesks[0];

      const bookingId = await bookDesk({
        deskId: desk.id,
        bookFrom: from,
        bookTo: to,
      });

      let isBooked = false;

      if (bookingId) {
        isBooked = true;

        console.log(
          `Booking created with id: ${bookingId}, 
           desk: ${desk.name[0].text}, 
           from: ${from}, to: ${to}, 
           floor: ${desk.floor.name[0].text},
           with amenities: ${desk.amenities
             .map((a) => a.name[0].text)
             .join(", ")}`
        );
      }

      if (!isBooked) throw new Error("Failed to book a desk");
    } catch (error) {
      console.error("failed to book desk on ", bookingDay);
    }
  }
}

async function login(username: string, password: string) {
  try {
    const response = await client.post<LoginResponse>(
      "app/identity/v1/login",
      JSON.stringify({
        emailOrUserName: username,
        password: password,
        rememberMe: true,
      })
    );

    const cookieHeaders = response.headers["set-cookie"];

    client.defaults.headers.common = {
      Cookie: (cookieHeaders ?? []).join(";"),
    };

    // console.log("COOKL", cookieHeaders);
  } catch (error) {
    console.error("failed to login");

    return null;
  }
}

async function getAvailableDesks({
  floors,
  amenities,
  availableStart,
  availableEnd,
}: {
  availableStart: Date;
  availableEnd: Date;
  floors?: Floor[];
  amenities?: Amenity[];
}) {
  try {
    const response = await client.post<
      BaseResponse<"booking", BookableResourcesDto>
    >(
      "graphql/batch",
      JSON.stringify([
        {
          operationName: "ResourcesListGetBookableResources",
          variables: {
            floorIds: floors,
            bookableResourceType: "desk",
            categories: [],
            // categories: ["workStation"],
            capacityRanges: [],
            amenityIds: amenities,
            availableStart: dayjs(availableStart).format(DateFormat),
            availableEnd: dayjs(availableEnd).format(DateFormat),
          },
          query:
            "query ResourcesListGetBookableResources($bookableResourceType: BookableResourceTypes!, $amenityIds: [Int!], $isCombine: Boolean, $floorIds: [Int!], $categories: [BookableResourceCategories], $capacityRanges: [CapacityRangeRequest!], $availableStart: DateTimeOffset!, $availableEnd: DateTimeOffset!) {\n  me {\n    app {\n      bookingUser {\n        booking {\n          bookableResource(\n            bookableResourceType: $bookableResourceType\n            isCombine: $isCombine\n          ) {\n            bookableResources(\n              amenityIds: $amenityIds\n              floorIds: $floorIds\n              categories: $categories\n              capacityRanges: $capacityRanges\n            ) {\n              ...resourcesBookableResource\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment resourcesBookableResource on BookableResourceGraphModel {\n  ...bookableResourceDetailStyled\n  areaId\n  floorPlanCoordinate {\n    x\n    y\n    __typename\n  }\n  restrictionForMe {\n    isReadonly\n    __typename\n  }\n  __typename\n}\n\nfragment bookableResourceDetailStyled on BookableResourceGraphModel {\n  id\n  type\n  capacity\n  category\n  name {\n    language\n    text\n    __typename\n  }\n  description {\n    language\n    text\n    __typename\n  }\n  isCombine\n  subResources {\n    id\n    name {\n      language\n      text\n      __typename\n    }\n    __typename\n  }\n  quotaCosts(start: $availableStart, end: $availableEnd) {\n    isAdvance\n    amountPerUnit\n    quotaUnitName\n    advance {\n      date\n      timeRange {\n        start\n        end\n        __typename\n      }\n      amountPerUnit\n      __typename\n    }\n    deductionType\n    __typename\n  }\n  actualServiceItems {\n    name {\n      language\n      text\n      __typename\n    }\n    description {\n      language\n      text\n      __typename\n    }\n    type\n    prePreparationMinutes\n    postPreparationMinutes\n    __typename\n  }\n  bookableResourcePolicy {\n    bookingPolicy {\n      bookingReviewType\n      __typename\n    }\n    __typename\n  }\n  outOfServicePeriods {\n    id\n    period {\n      start\n      end\n      __typename\n    }\n    remarks\n    __typename\n  }\n  thumbnailUrls\n  floor {\n    ...resourceFloor\n    __typename\n  }\n  amenities {\n    id\n    name {\n      language\n      text\n      __typename\n    }\n    iconName\n    __typename\n  }\n  availability(start: $availableStart, end: $availableEnd) {\n    todayNextAppointmentStartTime\n    todayNextAvailableStartTime\n    status\n    __typename\n  }\n  __typename\n}\n\nfragment resourceFloor on FloorGraphModel {\n  id\n  name {\n    language\n    text\n    __typename\n  }\n  order\n  building {\n    ...resourceBuilding\n    __typename\n  }\n  __typename\n}\n\nfragment resourceBuilding on BuildingGraphModel {\n  id\n  order\n  name {\n    language\n    text\n    __typename\n  }\n  __typename\n}",
        },
      ])
    );

    console.log(
      `looking for desks on ${dayjs(availableStart).format("YYYY-MM-DD")}`
    );

    const data =
      response.data[0].data.me.app.bookingUser.booking.bookableResource
        .bookableResources;

    console.log(`found ${data.length} desks`);

    const availableDesks = data.filter((desk) => {
      return desk.availability.status === "available";
    });

    console.log(`found ${availableDesks.length} available desks`);

    const sorted = availableDesks.sort((a, b) => {
      if (a.floor.id !== b.floor.id) {
        const aIndex = Preferences.floor.indexOf(a.floor.id);
        const bIndex = Preferences.floor.indexOf(b.floor.id);

        if (aIndex === bIndex) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;

        return aIndex - bIndex;
      }

      const diffAmenities = difference(
        a.amenities.map((a) => a.id),
        b.amenities.map((b) => b.id)
      );
      if (diffAmenities.length > 0) {
        const aMaxIndex = reduce<number, number>(
          max,
          -1,
          a.amenities.map((a) => Preferences.amenity.indexOf(a.id))
        );
        const bMaxIndex = reduce<number, number>(
          max,
          -1,
          b.amenities.map((b) => Preferences.amenity.indexOf(b.id))
        );

        if (aMaxIndex === bMaxIndex) return 0;
        if (aMaxIndex === -1) return 1;
        if (bMaxIndex === -1) return -1;

        return aMaxIndex - bMaxIndex;
      }

      return 0;
    });

    return sorted;
  } catch (error) {
    console.error("failed to get available desks");

    return null;
  }
}

async function bookDesk({
  deskId,
  bookFrom,
  bookTo,
}: {
  bookFrom: Date;
  bookTo: Date;
  deskId: number;
}) {
  try {
    console.log(
      "BOOKING",
      deskId,
      dayjs(bookFrom).format(DateFormat),
      dayjs(bookTo).format(DateFormat)
    );

    const response = await client.post<
      BaseResponse<"booking", BookingCreatedDto>
    >(
      "graphql/batch",
      JSON.stringify([
        {
          operationName: "AddBooking",
          variables: {
            request: {
              subject: "",
              htmlBody: "",
              textBody: "",
              period: {
                start: dayjs(bookFrom).format(DateFormat),
                startTimeZone: "Asia/Hong_Kong",
                end: dayjs(bookTo).format(DateFormat),
                endTimeZone: "Asia/Hong_Kong",
              },
              resources: [
                {
                  emailAddress: null,
                  bookableResourceId: deskId,
                },
              ],
              attendees: [],
              isAllDay: false,
              sensitive: "normal",
              recurrence: null,
              serviceItems: [],
              withOnlineMeeting: false,
              delegateUserId: null,
              extraFieldData: [],
              appointmentDraftId: null,
            },
          },
          query:
            "mutation AddBooking($request: BookingUserAddBookingRequest!) {\n  me {\n    app {\n      bookingUser {\n        booking {\n          add(request: $request) {\n            id\n            bookingState\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}",
        },
      ])
    );

    const { id: bookingId, bookingState } =
      response.data[0].data.me.app.bookingUser.booking.add;

    return bookingId;
  } catch (error) {
    console.error("failed to book desk");
    return null;
  }
}

type LoginResponse = {
  isSuccess: boolean;
  user: {
    id: number;
    displayName: string;
    emailAddress: string;
  };
};

type BookableResourcesDto = {
  bookableResource: { bookableResources: Resource[] };
};

type Resource = {
  id: number;
  type: string;
  name: { language: string; text: string }[];
  floor: {
    id: number;
    name: { language: string; text: string }[];
  };
  amenities: {
    id: number;
    name: { language: string; text: string }[];
  }[];
  availability: { status: "available" | "occupied" };
};

type BookingCreatedDto = {
  add: { id: number; bookingState: string };
};

type BaseResponse<K extends string, T = {}> = [
  {
    data: {
      me: {
        app: {
          bookingUser: {
            [P in K]: T;
          };
        };
      };
    };
  }
];

const DateFormat = "YYYY-MM-DDTHH:mm:ssZ";

function getDates(startDate: Date = new Date(), numberOfDays: number = 31) {
  const endDate = dayjs(startDate)
    .startOf("date")
    .add(numberOfDays, "day")
    .toDate();

  const dates = [startDate];

  while (dates.length <= numberOfDays) {
    const nextDate = dayjs(dates[dates.length - 1])
      .add(1, "day")
      .toDate();
    dates.push(nextDate);
  }

  return dates;
}

try {
  const datesToBook = getDates().filter((d) => {
    const index = Preferences.bookForWeekday.indexOf(dayjs(d).day());
    return index !== -1;
  });
  main(datesToBook);
} catch (error) {
  console.error(JSON.stringify(error));
}
