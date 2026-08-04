import { beforeEach, describe, expect, it } from "vitest";
import { get, post } from "../src/support/http.js";
import { tokenFor } from "../src/support/auth.js";
import { resetData } from "../src/support/db.js";
import { snapshotOf } from "../src/support/normalise.js";

describe("async_tasks", () => {
  beforeEach(async () => {
    await resetData();
  });

  describe("GET /api/async_tasks", () => {
    // No meta here. AsyncTasksController#resources does not call .page, so the
    // index is unpaginated where albums and images are paginated. Contract.
    it("returns the current user's tasks newest first, with no pagination meta", async () => {
      const response = await get("/api/async_tasks", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("never leaks another user's tasks", async () => {
      const response = await get("/api/async_tasks", { token: tokenFor("stranger") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await get("/api/async_tasks");
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/async_tasks/:id", () => {
    it("returns a pending task", async () => {
      const response = await get("/api/async_tasks/1", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // The completed task carries its result payload, including the download
    // url. AsyncTaskSerializer declares no :id attribute, so unlike albums and
    // images the id appears only at data.id and not in attributes.
    it("returns a completed task with its result", async () => {
      const response = await get("/api/async_tasks/2", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for another user's task", async () => {
      const response = await get("/api/async_tasks/3", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for a task that does not exist", async () => {
      const response = await get("/api/async_tasks/9999", { token: tokenFor("owner") });
      expect(snapshotOf(response)).toMatchSnapshot();
    });
  });

  // A successful create enqueues AlbumDownloadJob, which streams the album to
  // S3 — so only the rejections belong in the default tier. All of them fail
  // before the job is enqueued.
  describe("POST /api/async_tasks — rejections that never enqueue", () => {
    it("rejects an unknown task_type", async () => {
      const response = await post("/api/async_tasks", {
        token: tokenFor("owner"),
        json: { async_task: { task_type: "not_a_real_task", payload: { album_id: 1 } } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("rejects an album with no images", async () => {
      const response = await post("/api/async_tasks", {
        token: tokenFor("owner"),
        json: { async_task: { task_type: "album_download", payload: { album_id: 2 } } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    // The validator scopes through Album.with_user, so this raises
    // RecordNotFound and answers 404 rather than a validation failure.
    it("answers 404 for another user's album", async () => {
      const response = await post("/api/async_tasks", {
        token: tokenFor("owner"),
        json: { async_task: { task_type: "album_download", payload: { album_id: 3 } } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("answers 404 for an album that does not exist", async () => {
      const response = await post("/api/async_tasks", {
        token: tokenFor("owner"),
        json: { async_task: { task_type: "album_download", payload: { album_id: 9999 } } },
      });
      expect(snapshotOf(response)).toMatchSnapshot();
    });

    it("requires a token", async () => {
      const response = await post("/api/async_tasks", {
        json: { async_task: { task_type: "album_download", payload: { album_id: 1 } } },
      });
      expect(response.status).toBe(401);
    });
  });
});
