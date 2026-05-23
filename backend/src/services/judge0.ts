/**
 * Legacy Judge0 result shape.
 *
 * The platform no longer runs Judge0 — execution moved to a local Docker
 * runner (see services/dockerRunner.ts). This type is preserved because
 * execute.ts and dockerRunner.ts still use it as the per-test result shape;
 * renaming would cascade across many files for no functional benefit.
 *
 * Field semantics:
 *   statusId / statusDescription — historical Judge0 status taxonomy, now
 *     mapped from Docker exit codes inside the runner.
 *   stdout / stderr / compileOutput — captured streams.
 *   time   — wall-clock execution time in seconds (string for legacy reasons).
 *   memory — peak RSS in KB, or null if unavailable.
 */
export type Judge0RunResult = {
  statusId: number | null;
  statusDescription: string | null;
  stdout: string;
  stderr: string;
  compileOutput: string;
  time: string | null;
  memory: number | null;
};
