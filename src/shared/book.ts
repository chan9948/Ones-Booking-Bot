import axios, { AxiosInstance } from "axios";
import dayjs from "dayjs";
import { difference, max, reduce } from "ramda";

export enum Floor {
  Floor26 = 1,
  Floor27 = 2,
}

export enum Amenity {
  singleMonitor = 8,
  doubleMonitor = 9,
  partitionPanel = 10,
  heightAdjustable = 11,
}

export enum Day {
  Sunday = 0,
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
}

export interface BookingOptions {
  floor: Floor[];
  amenity: Amenity[];
  bookForWeekday: Day[];
  username: string;
  password: string;

  bookFromDate: Date;
  bookForDays: number;

  startHour: number;
  endHour: number;

  logger: Logger;
}

export interface Logger {
  log: (message?: any, ...optionalParams: any[]) => void;
  error: (message?: any, ...optionalParams: any[]) => void;
}

export async function book(options: BookingOptions) {
  const {
    bookForDays,
    bookForWeekday,
    bookFromDate,
    endHour,
    password,
    startHour,
    username,
  } = options;

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
      options.logger.log("Axios Error", JSON.stringify(error.response?.data));

      return Promise.reject(error);
    }
  );

  const datesToBook = getDates(bookFromDate, bookForDays).filter((d) => {
    const index = bookForWeekday.indexOf(dayjs(d).day());
    return index !== -1;
  });

  const loginRes = await login({ username, password, client });
  if (!loginRes) throw new Error("failed to login");

  for (const dateToBook of datesToBook) {
    try {
      options.logger.log("\n\n");

      const from = dayjs(dateToBook).startOf("day").hour(startHour).toDate();
      const to = dayjs(dateToBook).startOf("day").hour(endHour).toDate();

      const availableDesks = await getAvailableDesks({
        availableStart: from,
        availableEnd: to,
        options,
        client,
      });

      if (!availableDesks || availableDesks.length === 0)
        throw new Error("No available desks");

      const desk = availableDesks[0];

      const bookingId = await bookDesk({
        deskId: desk.id,
        bookFrom: from,
        bookTo: to,
        options,
        client,
      });

      let isBooked = false;

      if (bookingId) {
        isBooked = true;

        options.logger.log(
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
      options.logger.error("failed to book desk on ", dateToBook);
    }
  }
}

async function login({
  password,
  username,
  client,
}: {
  username: string;
  password: string;
  client: AxiosInstance;
}) {
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

    return response.data;
  } catch (error) {
    return null;
  }
}

async function getAvailableDesks({
  availableStart,
  availableEnd,
  client,
  options,
}: {
  availableStart: Date;
  availableEnd: Date;
  client: AxiosInstance;
  options: BookingOptions;
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
            floorIds: [],
            bookableResourceType: "desk",
            categories: [],
            capacityRanges: [],
            amenityIds: [],
            availableStart: dayjs(availableStart).format(DateFormat),
            availableEnd: dayjs(availableEnd).format(DateFormat),
          },
          query:
            "query ResourcesListGetBookableResources($bookableResourceType: BookableResourceTypes!, $amenityIds: [Int!], $isCombine: Boolean, $floorIds: [Int!], $categories: [BookableResourceCategories], $capacityRanges: [CapacityRangeRequest!], $availableStart: DateTimeOffset!, $availableEnd: DateTimeOffset!) {\n  me {\n    app {\n      bookingUser {\n        booking {\n          bookableResource(\n            bookableResourceType: $bookableResourceType\n            isCombine: $isCombine\n          ) {\n            bookableResources(\n              amenityIds: $amenityIds\n              floorIds: $floorIds\n              categories: $categories\n              capacityRanges: $capacityRanges\n            ) {\n              ...resourcesBookableResource\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment resourcesBookableResource on BookableResourceGraphModel {\n  ...bookableResourceDetailStyled\n  areaId\n  floorPlanCoordinate {\n    x\n    y\n    __typename\n  }\n  restrictionForMe {\n    isReadonly\n    __typename\n  }\n  __typename\n}\n\nfragment bookableResourceDetailStyled on BookableResourceGraphModel {\n  id\n  type\n  capacity\n  category\n  name {\n    language\n    text\n    __typename\n  }\n  description {\n    language\n    text\n    __typename\n  }\n  isCombine\n  subResources {\n    id\n    name {\n      language\n      text\n      __typename\n    }\n    __typename\n  }\n  quotaCosts(start: $availableStart, end: $availableEnd) {\n    isAdvance\n    amountPerUnit\n    quotaUnitName\n    advance {\n      date\n      timeRange {\n        start\n        end\n        __typename\n      }\n      amountPerUnit\n      __typename\n    }\n    deductionType\n    __typename\n  }\n  actualServiceItems {\n    name {\n      language\n      text\n      __typename\n    }\n    description {\n      language\n      text\n      __typename\n    }\n    type\n    prePreparationMinutes\n    postPreparationMinutes\n    __typename\n  }\n  bookableResourcePolicy {\n    bookingPolicy {\n      bookingReviewType\n      __typename\n    }\n    __typename\n  }\n  outOfServicePeriods {\n    id\n    period {\n      start\n      end\n      __typename\n    }\n    remarks\n    __typename\n  }\n  thumbnailUrls\n  floor {\n    ...resourceFloor\n    __typename\n  }\n  amenities {\n    id\n    name {\n      language\n      text\n      __typename\n    }\n    iconName\n    __typename\n  }\n  availability(start: $availableStart, end: $availableEnd) {\n    todayNextAppointmentStartTime\n    todayNextAvailableStartTime\n    status\n    __typename\n  }\n  __typename\n}\n\nfragment resourceFloor on FloorGraphModel {\n  id\n  name {\n    language\n    text\n    __typename\n  }\n  order\n  building {\n    ...resourceBuilding\n    __typename\n  }\n  __typename\n}\n\nfragment resourceBuilding on BuildingGraphModel {\n  id\n  order\n  name {\n    language\n    text\n    __typename\n  }\n  __typename\n}",
        },
      ])
    );

    options.logger.log(
      `looking for desks on ${dayjs(availableStart).format("YYYY-MM-DD")}`
    );

    const data =
      response.data[0].data.me.app.bookingUser.booking.bookableResource
        .bookableResources;

    options.logger.log(`found ${data.length} desks`);

    const availableDesks = data.filter((desk) => {
      return desk.availability.status === "available";
    });

    options.logger.log(`found ${availableDesks.length} available desks`);

    const sorted = availableDesks.sort((a, b) => {
      if (a.floor.id !== b.floor.id) {
        const aIndex = options.floor.indexOf(a.floor.id);
        const bIndex = options.floor.indexOf(b.floor.id);

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
          a.amenities.map((a) => options.amenity.indexOf(a.id))
        );
        const bMaxIndex = reduce<number, number>(
          max,
          -1,
          b.amenities.map((b) => options.amenity.indexOf(b.id))
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
    options.logger.error("failed to get available desks");

    return null;
  }
}

async function bookDesk({
  deskId,
  bookFrom,
  bookTo,
  options,
  client,
}: {
  bookFrom: Date;
  bookTo: Date;
  deskId: number;
  client: AxiosInstance;
  options: BookingOptions;
}) {
  try {
    options.logger.log(
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
    options.logger.error("failed to book desk");
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
