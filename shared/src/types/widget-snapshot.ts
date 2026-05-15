/** Single habit entry in the widget snapshot; matches App Group payload contract. */
export type WidgetHabitEntry = {
  id: string;
  title: string;
  isCompletedToday: boolean;
  displayColor: string;
  displayIcon: string;
  displayOrder: number;
};

/** Widget snapshot root; matches App Group payload contract. */
export type WidgetSnapshot = {
  habits: WidgetHabitEntry[];
  lastUpdated: string;
};
