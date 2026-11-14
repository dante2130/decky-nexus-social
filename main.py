"""Decky RPC bridge for the signed-in Nexus account."""
import asyncio
import json
import os
from pathlib import Path
import pwd
import re
import ssl
import sys
from urllib.parse import quote

import decky

# The release archive bundles this pure Python dependency.
sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
from websockets.asyncio.client import connect

XUID = re.compile(r"[1-9][0-9]{0,19}")
PARTY_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
PEOPLE_LISTS = {"search", "received-requests", "sent-requests", "blocked"}
PEOPLE_ACTIONS = {
    "send-request", "accept-request", "decline-request", "cancel-request",
    "remove-friend", "favorite", "unfavorite", "block", "unblock",
}


def xbox_id(value):
    if not isinstance(value, str) or not XUID.fullmatch(value) or int(value) >= 2**64:
        raise ValueError("Select an Xbox player.")
    return value


def backend_command():
    home = Path(decky.DECKY_USER_HOME)
    user = pwd.getpwuid(home.stat().st_uid)
    if user.pw_uid == 0:
        raise ValueError("Nexus Social needs a Steam user session.")
    config = home / ".config"
    try:
        pointer = json.loads((config / "xodus-nexus/xodus-backends/current.json").read_text())
        binary = Path(pointer["binaryPath"])
        if not binary.is_absolute() or not binary.is_file() or not os.access(binary, os.X_OK):
            raise ValueError
    except (OSError, ValueError, KeyError, TypeError):
        raise ValueError("Install the Nexus backend and sign in through Xodus Nexus.") from None
    env = {
        "HOME": str(home), "USER": user.pw_name, "LOGNAME": user.pw_name,
        "PATH": "/usr/bin:/bin", "XODUS_LOG": "error",
        "XDG_CONFIG_HOME": str(config), "XDG_DATA_HOME": str(home / ".local/share"),
        "XDG_CACHE_HOME": str(home / ".cache"), "XDG_RUNTIME_DIR": f"/run/user/{user.pw_uid}",
        "DBUS_SESSION_BUS_ADDRESS": f"unix:path=/run/user/{user.pw_uid}/bus",
    }
    # A release may bundle a newer social CLI while sharing the Nexus sign-in.
    bundled = Path(__file__).resolve().parent / "bin/xodus-cli"
    if bundled.is_file() and os.access(bundled, os.X_OK):
        binary = bundled
    command = [str(binary), "native-social", "listen"]
    if os.geteuid() == 0:
        # Drop privileges before executing a binary selected by the Steam user.
        command = ["/usr/bin/setpriv", "--reuid", str(user.pw_uid), "--regid",
                   str(user.pw_gid), "--init-groups", "--", *command]
    elif os.geteuid() != user.pw_uid:
        raise ValueError("Decky must run as root or as the Steam user.")
    return command, env


async def native(kind, *args, payload=None, account=None):
    command, env = backend_command()
    frame = {"id": 1, "args": [kind, *args], "input": json.dumps(payload, ensure_ascii=False) if payload is not None else None}
    process = await asyncio.create_subprocess_exec(
        *command, env=env, cwd=env["HOME"], limit=8 * 1024 * 1024,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        process.stdin.write((json.dumps(frame, ensure_ascii=False) + "\n").encode())
        async with asyncio.timeout(58):
            await process.stdin.drain()
            process.stdin.close()
            raw = await process.stdout.readline()
            if not raw:
                raise ValueError("Nexus social backend unavailable. Check your Nexus sign-in and backend version.")
            reply = json.loads(raw)
    except TimeoutError:
        raise ValueError("Xbox did not respond in time. Refresh before retrying.") from None
    finally:
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        await process.wait()

    if reply.get("id") != 1 or reply.get("ok") is not True:
        stage = reply.get("stage", "")
        if stage == "party-already-active":
            raise ValueError("Leave the existing Xbox party on your other device first.")
        if stage == "account-changed":
            raise ValueError("Xbox account changed. Reload the panel.")
        if not isinstance(stage, str) or not re.fullmatch(r"[a-z0-9-]{1,64}", stage):
            stage = "backend-error"
        raise ValueError(f"Xbox request failed ({stage}). Check your Nexus sign-in or refresh before retrying.")
    result = reply["result"]
    if result.get("schema") != 1 or result.get("kind") != ("sent" if kind == "send-message" else kind):
        raise ValueError("Unsupported Nexus social response.")
    if account is not None and result.get("account") != account:
        raise ValueError("Xbox account changed. Reload the panel.")
    if kind in {"party", "people"} and result.get("operation") != payload["operation"]:
        raise ValueError("Nexus returned an unexpected operation.")
    return result


class Plugin:
    async def _main(self):
        self.party_lock = asyncio.Lock()
        self.party_id = None
        self.party_account = None
        self.socket = None
        self.socket_task = None
        self.party_connection_alive = False
        self.friends_lock = asyncio.Lock()
        self.friends_cache = None
        self.friends_worker = None

    async def _unload(self):
        if self.friends_worker:
            self.friends_worker.cancel()
            await asyncio.gather(self.friends_worker, return_exceptions=True)
        await self.leave_party()

    async def load(self):
        profile = await native("profile", "me")
        account = profile["account"]
        friends, inbox, presence = await asyncio.gather(
            self.refresh_friends(account), native("inbox", account=account),
            self._profile_presence(account),
        )
        if not self.friends_worker or self.friends_worker.done():
            self.friends_worker = asyncio.create_task(self._refresh_friends_in_background())
        return {"account": account, "me": {**profile["items"][0], **presence},
                "friends": friends, "inbox": inbox["items"]}

    async def _profile_presence(self, account):
        payload = {"account": account, "operation": "profile", "xuid": "me"}
        try:
            async with asyncio.timeout(5):
                profile = (await native("people", payload=payload, account=account))["result"]
        except (ValueError, TimeoutError):
            return {}
        return {key: profile[key] for key in ("online", "presence") if key in profile}

    async def refresh_friends(self, account):
        async with self.friends_lock:
            friends = (await native("friends", account=account))["items"]
            self.friends_cache = (account, friends)
            return friends

    async def _refresh_friends_in_background(self):
        delay = 3
        while self.friends_cache:
            await asyncio.sleep(delay)
            account, _ = self.friends_cache
            try:
                async with self.friends_lock:
                    if self.friends_cache[0] != account:
                        continue
                    friends = (await native("friends", account=account))["items"]
                    if friends != self.friends_cache[1]:
                        self.friends_cache = (account, friends)
                        await decky.emit("friends_updated", account, friends)
                delay = 30
            except (OSError, ValueError, TimeoutError):
                delay = 60


    async def player_profile(self, account, xuid):
        return (await native("profile", xbox_id(xuid), account=account))["items"][0]

    async def conversation(self, account, xuid):
        return (await native("conversation", xbox_id(xuid), account=account))["items"]

    async def send_message(self, account, xuid, body):
        if not isinstance(body, str) or not body.strip() or len(body) > 256:
            raise ValueError("Enter a message with up to 256 characters.")
        await native("send-message", account=account,
                     payload={"account": account, "xuid": xbox_id(xuid), "text": body})

    async def people(self, account, operation, value=""):
        if operation not in PEOPLE_LISTS | PEOPLE_ACTIONS:
            raise ValueError("Unsupported Xbox friends action.")
        payload = {"account": account, "operation": operation}
        if operation in PEOPLE_ACTIONS:
            payload["xuid"] = xbox_id(value)
        if operation == "search":
            if not isinstance(value, str) or not 1 <= len(value.strip()) <= 64:
                raise ValueError("Enter a gamertag to search.")
            payload["query"] = value.strip()
        return (await native("people", payload=payload, account=account))["result"]

    async def _party_request(self, operation, **fields):
        account = self.party_account
        payload = {"account": account, "operation": operation, **fields}
        return (await native("party", account=account, payload=payload))["result"]

    async def _connect_chat(self):
        auth = await native("chat-auth", account=self.party_account)
        xuid = xbox_id(auth["xuid"])
        url = f'wss://chat.xboxlive.com/users/xuid({xuid})/chat/connect?AuthKey={quote(auth["authKey"], safe="")}'
        # Keep the authentication URL and handshake in the Decky backend.
        context = ssl.create_default_context(cafile="/etc/ssl/certs/ca-certificates.crt")
        async with asyncio.timeout(20):
            self.socket = await connect(url, subprotocols=["chat"], max_size=256 * 1024,
                                        ssl=context, proxy=None, close_timeout=2)
            await self.socket.send(json.dumps({
                "clientSeqNum": 1, "channel": {"type": "System"}, "messageType": "WhoAmI"
            }))
            async for frame in self.socket:
                message = json.loads(frame)
                if message.get("channel", {}).get("type") != "System" or message.get("messageType") != "WhoAmI":
                    continue
                identity = {key: message.get(key) for key in ("connectionId", "serverNonce")}
                if any(not isinstance(value, str) or not value for value in identity.values()):
                    break
                await self.socket.send(json.dumps({
                    "clientSeqNum": 2, "channel": {"type": "Party", "id": xuid}, "messageType": "JoinChannel"
                }))
                self.party_connection_alive = True
                self.socket_task = asyncio.create_task(self._watch_chat(self.socket, xuid))
                return identity
        raise ValueError("Xbox did not complete the party handshake.")

    async def _watch_chat(self, socket, xuid):
        try:
            async for frame in socket:
                message = json.loads(frame)
                if message.get("channel") == {"type": "Party", "id": xuid} and message.get("messageType") == "Party":
                    if message.get("payload", {}).get("type") == "Kicked":
                        break
        except Exception:
            pass
        finally:
            self.party_connection_alive = False

    async def start_party(self, account, offer, joinability="inviteOnly", friend=None):
        async with self.party_lock:
            if joinability not in ("inviteOnly", "followedByMembers"):
                raise ValueError("Select a supported party privacy setting.")
            if self.party_id:
                raise ValueError("Leave the current Xbox party first.")
            if not isinstance(offer, str) or len(offer.encode()) > 128 * 1024:
                raise ValueError("Invalid Xbox voice offer.")
            self.party_account = account
            try:
                try:
                    identity = await self._connect_chat()
                except Exception:
                    raise ValueError("Xbox party signaling could not connect. Check your Nexus sign-in.") from None
                if friend is None:
                    party = await self._party_request("create", offer=offer, joinability=joinability, **identity)
                else:
                    xuid = xbox_id(friend)
                    friends = (await native("friends", account=account))["items"]
                    party_id = next((player.get("joinablePartyId") for player in friends if player["xuid"] == xuid), None)
                    if not party_id:
                        details = await self._party_request("friend-party", xuid=xuid)
                        party_id = details["joinableId"]
                    if not party_id:
                        raise ValueError("This friend's party is no longer joinable.")
                    party = await self._party_request("join", offer=offer, partyId=party_id, **identity)
                party_id = party["id"]
                if not isinstance(party_id, str) or not PARTY_ID.fullmatch(party_id):
                    raise ValueError("Invalid Xbox party ID.")
                self.party_id = party_id
                async with asyncio.timeout(30):
                    while not party.get("transportResponse"):
                        if not self.party_connection_alive:
                            raise ValueError("Xbox party signaling disconnected.")
                        await asyncio.sleep(1)
                        party = await self._party_request("get", partyId=party_id)
                        if party.get("id") != party_id:
                            raise ValueError("Xbox returned a different party.")
                answer = json.loads(party["transportResponse"])
                if (answer.get("status") != "success" or answer.get("sdpType") != "answer"
                    or not isinstance(answer.get("sdp"), str) or not answer["sdp"].startswith("v=0\r\n")
                    or not isinstance(answer.get("iceCandidates"), list) or len(answer["iceCandidates"]) > 128):
                    raise ValueError("Xbox rejected the voice relay connection.")
                return {"id": party_id, "answer": {key: answer[key] for key in ("sdpType", "sdp", "iceCandidates")}}
            except BaseException:
                try:
                    await self._leave_party()
                except Exception:
                    pass
                raise

    async def _leave_party(self):
        try:
            if self.party_id:
                await self._party_request("leave", partyId=self.party_id)
                self.party_id = None
        finally:
            if self.socket:
                await self.socket.close()
                self.socket = None
            if self.socket_task:
                await self.socket_task
                self.socket_task = None
            self.party_connection_alive = False
            if not self.party_id:
                self.party_account = None

    async def leave_party(self):
        async with self.party_lock:
            await self._leave_party()

    async def party_status(self):
        return {"alive": bool(self.party_id and self.party_connection_alive)}

    async def party_state(self):
        async with self.party_lock:
            if not self.party_id:
                return {"id": None, "alive": False, "members": []}
            if not self.party_connection_alive:
                return {"id": self.party_id, "alive": False, "members": []}
            party = await self._party_request("get", partyId=self.party_id)
            if party.get("id") != self.party_id:
                raise ValueError("Xbox returned a different party.")
            return {"id": self.party_id, "alive": True, "members": party["members"]}

    async def invite_friend(self, xuid, party_id):
        async with self.party_lock:
            if not self.party_id or not self.party_connection_alive:
                raise ValueError("Connect to an Xbox party before inviting a friend.")
            if self.party_id != party_id:
                raise ValueError("This party has changed. Reopen Add people.")
            await self._party_request("invite", partyId=party_id, xuid=xbox_id(xuid))

    async def voice_allowed(self, xuid):
        if not self.party_id or not self.party_connection_alive:
            return False
        return (await self._party_request("voice-policy", xuid=xbox_id(xuid)))["isAllowed"] is True

    async def text_allowed(self, xuid):
        if not self.party_id or not self.party_connection_alive:
            return False
        return (await self._party_request("text-policy", xuid=xbox_id(xuid)))["isAllowed"] is True
