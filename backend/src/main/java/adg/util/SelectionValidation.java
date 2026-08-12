package adg.util;

import com.adg.openapi.model.MoveType;

public class SelectionValidation {
  final Selection selection;
  MoveType moveType;

  public SelectionValidation(Selection selection, MoveType moveType) {
    this.selection = selection;
    this.moveType = moveType;
  }

  public SelectionValidation(Selection selection) {
    this.selection = selection;
  }

  public boolean isValid() {
    return selection.equals(Selection.VALID);
  }

  public MoveType getMoveType() {
    return moveType;
  }
}
