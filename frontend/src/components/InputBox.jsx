export const InputBox = ({ onChange, placeholder, label, type = "text" }) => {
  return (
    <div className="mb-4">
      <label className="block text-gray-700 text-sm font-bold mb-2">
        {label}
      </label>
      <input
        type={type}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-3 py-2 border-2 border-gray-300 rounded focus:outline-none focus:border-blue-500 focus:border-3 transition duration-400 ease-in-out"
      />
    </div>
  );
};
