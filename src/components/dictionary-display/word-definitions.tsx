interface WordDefinitionsProps {

  data: any[];
}

const WordDefinitions = ({ data }: WordDefinitionsProps) => {

  return (
    <div className="space-y-2">
      {data?.map((def, index) => {
        const definition = def.tr[0].l.i[0];
        const pos = definition.indexOf(' ');
        const partOfSpeech = definition.slice(0, pos);
        const meaning = definition.slice(pos + 1);

        return (
          <div key={index} className={`border-l-4 border-gray-300 pl-4`}>
            <h3 className={`text-sm font-semibold text-gray-700 mb-2`}>
              {partOfSpeech}
            </h3>
            <p className="text-xs text-gray-700 leading-relaxed">{meaning}</p>
          </div>
        );
      })}
    </div>
  );
};

export default WordDefinitions;