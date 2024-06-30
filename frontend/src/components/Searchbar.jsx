export const SearchBar = ({ value, onChange }) => {
  return (
    <div className="my-4 flex items-center border rounded-full px-4 py-2 shadow-md bg-white">
      <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1016.65 16.65l4.35 4.35z"></path>
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Student ID or name"
        className="w-full px-2 py-1 border-0 focus:outline-none"
      />
    </div>
  );
};