import { Amenity, Day, Floor, book } from "./shared/book";

function main() {
  book({
    //[Floor.Floor27, Floor.Floor26] -> looking for 27/F then 26/F
    floor: [Floor.Floor27, Floor.Floor26],
    // [Amenity.doubleMonitor, Amenity.singleMonitor] -> looking for double monitor then single monitor
    amenity: [Amenity.doubleMonitor, Amenity.singleMonitor],
    // [Day.Monday, Day.Tuesday, Day.Wednesday] -> only book desk for Monday, Tuesday, Wednesday
    bookForWeekday: [Day.Monday, Day.Tuesday, Day.Wednesday],

    //your email and password
    username: "email",
    password: "password",

    //new Date() -> book from today, new Date('2021-09-01') -> book from 2021-09-01
    bookFromDate: new Date(),
    //31 -> book for 31 days from bookFromDate
    bookForDays: 31,

    //9 -> book from 9am
    startHour: 9,
    //18 -> book until 6pm (max to book 10 hours)
    endHour: 18,
    logger: {
      error: console.error,
      log: console.log,
    },
  });
}

main();
