package adg.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ChatProxyControllerTest {

  // SSE allows one optional space after "data:". The chat server (Spring's SseEmitter) sends none,
  // and the proxy only knew the spaced form: it dropped every message, so the chat never showed.
  @ParameterizedTest
  @ValueSource(strings = {"data:[{\"sender\":\"Anton\"}]", "data: [{\"sender\":\"Anton\"}]"})
  void readsTheMessagesOfADataLine_withOrWithoutASpace(String line) {
    assertEquals("[{\"sender\":\"Anton\"}]", ChatProxyController.dataOf(line));
  }

  // Everything else in the stream frames the messages: the event name, its id, keep-alive comments,
  // and the blank line that ends an event. None of it is a message, so none of it is forwarded.
  @ParameterizedTest
  @ValueSource(strings = {"event:message", "id:7", ":keep-alive", "", "metadata:[]"})
  void findsNoMessage_inALineThatIsNotData(String line) {
    assertNull(ChatProxyController.dataOf(line));
  }
}
