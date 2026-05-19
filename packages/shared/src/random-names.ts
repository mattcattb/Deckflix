import {generateSlug, type RandomWordOptions} from "random-word-slugs";

const roomNameOptions: RandomWordOptions<2> = {
  format: "title",
  partsOfSpeech: ["adjective", "noun"],
  categories: {
    adjective: ["appearance", "personality", "time"],
    noun: ["media", "place", "thing", "time"],
  },
};

const userNameOptions: RandomWordOptions<2> = {
  format: "title",
  partsOfSpeech: ["adjective", "noun"],
  categories: {
    adjective: ["appearance", "personality"],
    noun: ["people", "profession"],
  },
};

export const createRandomRoomName = () =>
  generateSlug(2, roomNameOptions);

export const createRandomUserName = () =>
  generateSlug(2, userNameOptions);

export const resolveRoomName = (roomName?: string | null) =>
  roomName?.trim() || createRandomRoomName();

export const resolveUserName = (userName?: string | null) =>
  userName?.trim() || createRandomUserName();
