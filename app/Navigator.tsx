"use client";

type NavItem = {
  questionno: number | null;
  answered: boolean;
  marked: boolean;
};

export default function Navigator({
  items,
  currentIndex,
  onJump,
  onClose,
  onReview,
}: {
  items: NavItem[];
  currentIndex: number;
  onJump: (index: number) => void;
  onClose: () => void;
  onReview: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-md p-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Questions</h2>
          <button onClick={onClose} className="text-gray-500 text-sm">Close</button>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => {
                onJump(i);
                onClose();
              }}
              className={`relative h-10 rounded text-sm font-semibold
                ${i === currentIndex ? "ring-2 ring-blue-600" : ""}
                ${it.answered ? "bg-blue-600 text-white" : "border border-dashed border-gray-400 bg-white text-blue-700"}`}
            >
              {i + 1}
              {it.marked && (
                <span className="absolute -top-1 -right-1 text-amber-500 text-xs">🔖</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span><span className="inline-block w-3 h-3 bg-blue-600 rounded mr-1 align-middle" />Answered</span>
          <span><span className="inline-block w-3 h-3 bg-white border border-dashed border-gray-400 rounded mr-1 align-middle" />Unanswered</span>
          <span>🔖 Marked</span>
        </div>
        <button
          onClick={onReview}
          className="w-full mt-4 border-2 border-blue-600 text-blue-600 rounded-full py-2 text-sm font-semibold hover:bg-blue-50"
        >
          Go to Review Page
        </button>
      </div>
    </div>
  );
}
