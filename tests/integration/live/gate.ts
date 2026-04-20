export function liveOnly(name: string, fn: () => void) {
  if (process.env.SABLE_RUN_LIVE_TESTS === '1') {
    describe(name, fn);
  } else {
    describe.skip(`[LIVE] ${name}`, fn);
  }
}
