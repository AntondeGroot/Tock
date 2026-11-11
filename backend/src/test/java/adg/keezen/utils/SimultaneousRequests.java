package adg.keezen.utils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Sends requests all at once, the way a fast double-click does: every request is on its way before
 * the first answer comes back, so the server handles them side by side.
 */
public final class SimultaneousRequests {

  private static final String BASE_URL = "http://localhost:4200";
  private static final HttpClient CLIENT =
      HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

  private SimultaneousRequests() {}

  /** POSTs {@code json} to {@code path} {@code copies} times at once; the status of each copy. */
  public static List<Integer> post(String path, String json, int copies) {
    return sendAll(Collections.nCopies(copies, postRequest(path, json)));
  }

  /** DELETEs {@code path} {@code copies} times at once; the status of each copy. */
  public static List<Integer> delete(String path, int copies) {
    return sendAll(Collections.nCopies(copies, deleteRequest(path)));
  }

  /** Sends every request at once; their statuses, in the same order. */
  public static List<Integer> sendAll(List<HttpRequest> requests) {
    openConnections(requests.size());
    return statuses(requests);
  }

  /**
   * Opening a connection takes longer than handling a request, so copies that each still had to
   * connect would arrive one after another rather than together. A harmless request per copy first
   * leaves that many connections open, for the real requests to go out on side by side.
   */
  private static void openConnections(int count) {
    HttpRequest listGames = HttpRequest.newBuilder(URI.create(BASE_URL + "/games")).build();
    statuses(Collections.nCopies(count, listGames));
  }

  private static List<Integer> statuses(List<HttpRequest> requests) {
    List<CompletableFuture<HttpResponse<Void>>> sent =
        requests.stream().map(r -> CLIENT.sendAsync(r, BodyHandlers.discarding())).toList();
    return sent.stream().map(response -> response.join().statusCode()).toList();
  }

  public static HttpRequest postRequest(String path, String json) {
    return HttpRequest.newBuilder(URI.create(BASE_URL + path))
        .header("Content-Type", "application/json")
        .POST(BodyPublishers.ofString(json))
        .build();
  }

  public static HttpRequest deleteRequest(String path) {
    return HttpRequest.newBuilder(URI.create(BASE_URL + path)).DELETE().build();
  }
}
