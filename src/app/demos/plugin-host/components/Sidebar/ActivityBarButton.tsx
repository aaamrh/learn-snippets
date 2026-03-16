function ActivityBarButton({
  icon,
  title,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`
        w-8 h-8 flex items-center justify-center rounded text-sm transition-colors
        ${
          active
            ? "bg-gray-700 text-white border-l-2 border-blue-500"
            : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
        }
      `}
    >
      {icon}
    </button>
  );
}

export default ActivityBarButton;
