CREATE TEXT SEARCH DICTIONARY ispell_ru (
  template  =   ispell,
  dictfile  =   ru,
  afffile   =   ru,
  stopwords =   russian
);

CREATE TEXT SEARCH DICTIONARY ispell_en (
    template  = ispell,
    dictfile  = en,
    afffile   = en,
    stopwords = english
);

CREATE TEXT SEARCH CONFIGURATION ff_search_config ( COPY = russian );

ALTER TEXT SEARCH CONFIGURATION ff_search_config ALTER MAPPING FOR word, hword, hword_part WITH ispell_ru, russian_stem;

ALTER TEXT SEARCH CONFIGURATION ff_search_config ALTER MAPPING FOR asciiword, asciihword, hword_asciipart WITH ispell_en, english_stem;

SET default_text_search_config = 'ff_search_config';