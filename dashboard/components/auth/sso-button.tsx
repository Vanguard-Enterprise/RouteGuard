interface SSOButtonProps {
  displayName: string
  onClick: () => void
}

export default function SSOButton({ displayName, onClick }: SSOButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
    >
      <span>Sign in with {displayName}</span>
    </button>
  )
}
