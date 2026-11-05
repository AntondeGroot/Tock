package adg.services;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ChatProxyControllerTest {

  /** Runs the SSE parser over the given raw stream text and returns the forwarded event data. */
  private static List<String> forwardedEvents(String stream) throws IOException {
    List<String> events = new ArrayList<>();
    ChatProxyController.forwardEvents(new BufferedReader(new StringReader(stream)), events::add);
    return events;
  }

  /** The chat server (Spring SseEmitter) writes "data:" without a space; those events must still be forwarded. */
  @Test
  void forwards_data_lines_without_a_space_after_the_colon() throws IOException {
    assertEquals(List.of("[{\"sender\":\"a\"}]"), forwardedEvents("data:[{\"sender\":\"a\"}]\n\n"));
  }

  /** Per the SSE spec exactly one space after "data:" is a separator, not part of the value; a second one is kept. */
  @Test
  void strips_the_single_space_after_data_colon() throws IOException {
    assertEquals(List.of(" x"), forwardedEvents("data:  x\n\n"));
  }

  /** Only data lines carry the payload; event, id and comment lines (keep-alives) must not leak into it. */
  @Test
  void ignores_non_data_lines() throws IOException {
    assertEquals(List.of("x"), forwardedEvents("event:message\nid:1\n:keep-alive\ndata:x\n\n"));
  }

  /** Each blank line closes one event, so back-to-back events arrive separately instead of glued together. */
  @Test
  void emits_one_event_per_blank_line() throws IOException {
    assertEquals(List.of("[1]", "[2]"), forwardedEvents("data:[1]\n\ndata:[2]\n\n"));
  }

  /** Per the SSE spec an event is only complete at its blank line; a stream cut off mid-event must not forward the fragment. */
  @Test
  void drops_an_event_without_a_closing_blank_line() throws IOException {
    assertEquals(List.of("[1]"), forwardedEvents("data:[1]\n\ndata:[2"));
  }

  /**
   * Keep-alives must reach the browser: a quiet chat otherwise sends nothing, and nginx drops the
   * stream after 60 seconds. They are reported separately, so they never end up in a message.
   */
  @Test
  void reports_comment_lines_as_keep_alives_and_keeps_them_out_of_the_data() throws IOException {
    List<String> events = new ArrayList<>();
    AtomicInteger keepAlives = new AtomicInteger();
    ChatProxyController.EventSink sink = new ChatProxyController.EventSink() {
      @Override
      public void accept(String data) {
        events.add(data);
      }

      @Override
      public void keepAlive() {
        keepAlives.incrementAndGet();
      }
    };

    String stream = ":ping\n\ndata:x\n\n:ping\n\n";
    ChatProxyController.forwardEvents(new BufferedReader(new StringReader(stream)), sink);

    assertEquals(List.of("x"), events);
    assertEquals(2, keepAlives.get());
  }
}
