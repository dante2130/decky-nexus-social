import { callable } from "@decky/api";

export interface Player {
  xuid: string;
  gamertag: string;
  gamerscore?: string | null;
  presence?: string;
  online?: boolean;
  avatarUrl?: string | null;
  inParty?: boolean;
  joinablePartyId?: string;
  device?: "xbox" | "pc" | null;
  favorite?: boolean;
}
export interface Message {
  id: string;
  mine: boolean;
  text: string;
  hidden: boolean;
  timestamp: string | null;
}
export interface Thread {
  id: string;
  type: string | null;
  participants: string[];
  unread: boolean;
  lastMessage: Message | null;
}
export interface Snapshot {
  account: string;
  me: Player;
  friends: Player[];
  inbox: Thread[];
}
export interface Party {
  id: string | null;
  alive: boolean;
  members: { xuid: string; role: string | null }[];
}
export type Joinability = "inviteOnly" | "followedByMembers";
interface PartyAnswer {
  id: string;
  answer: { sdpType: "answer"; sdp: string; iceCandidates: RTCIceCandidateInit[] };
}
export type PeopleList = "search" | "received-requests" | "sent-requests" | "blocked";
export type PeopleAction = "send-request" | "accept-request" | "decline-request" | "cancel-request"
  | "remove-friend" | "favorite" | "unfavorite" | "block" | "unblock";

export const load = callable<[], Snapshot>("load");
export const refreshFriends = callable<[string], Player[]>("refresh_friends");
export const playerProfile = callable<[string, string], Player>("player_profile");
export const conversation = callable<[string, string], Message[]>("conversation");
export const sendMessage = callable<[string, string, string], void>("send_message");
export const listPeople = callable<[string, PeopleList, string], { items: Player[]; truncated: boolean }>("people");
export const changePeople = callable<[string, PeopleAction, string], { success: boolean }>("people");
export const partyStatus = callable<[], { alive: boolean }>("party_status");
export const partyState = callable<[], Party>("party_state");
export const startParty = callable<[string, string, Joinability, string?], PartyAnswer>("start_party");
export const leaveParty = callable<[], void>("leave_party");
export const inviteFriend = callable<[string, string], void>("invite_friend");
export const voiceAllowed = callable<[string], boolean>("voice_allowed");

export const textAllowed = callable<[string], boolean>("text_allowed");

export interface VoiceApi {
  startXboxParty(offer: string, joinability: Joinability, friend?: string): Promise<PartyAnswer>;
  confirmXboxParty(id: string): Promise<void>;
  leaveXboxParty(): Promise<void>;
  xboxTextAllowed(xuid: string): Promise<boolean>;
  xboxVoiceAllowed(xuid: string): Promise<boolean>;
}
