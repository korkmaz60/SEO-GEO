/** A stand-in for the DataForSEO API that knows one valid login. */
export const GOOD_LOGIN = { login: "api@example.com", password: "good-api-password" };
/** A login whose requests fail at the network level. */
export const UNREACHABLE_LOGIN = { login: "offline@example.com", password: "whatever" };

export function fakeDataForSeo(state: { balance: number } = { balance: 42.5 }) {
  const calls: string[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const [login, password] = Buffer.from(auth.replace(/^Basic /, ""), "base64")
      .toString("utf8")
      .split(":");
    if (login === UNREACHABLE_LOGIN.login) throw new TypeError("fetch failed");
    if (login !== GOOD_LOGIN.login || password !== GOOD_LOGIN.password) {
      return Response.json(
        { status_code: 40100, status_message: "You are not authorized to access this resource." },
        { status: 401 },
      );
    }
    return Response.json({
      version: "0.1.20260901",
      status_code: 20000,
      status_message: "Ok.",
      cost: 0,
      tasks: [
        {
          id: "task-1",
          status_code: 20000,
          status_message: "Ok.",
          cost: 0,
          result: [{ login: GOOD_LOGIN.login, money: { total: 100, balance: state.balance } }],
        },
      ],
    });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls, state };
}
