package adg.services;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
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
}
