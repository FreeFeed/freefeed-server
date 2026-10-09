export function addModel(dbAdapter) {
  return class Document {
    constructor(params) {
      this.id = params.id;
      this.userId = params.userId;
      this.title = params.title || '';
      this.slug = params.slug || '';
      this.body = params.body || '';
      this.parentId = params.parentId || null;
      this.isPublished = params.isPublished !== false;
      this.visibility = params.visibility || 'public';
      this.tags = params.tags || [];
      this.createdAt = params.createdAt;
      this.updatedAt = params.updatedAt;
    }

    get url() {
      return `/docs/${this.slug}`;
    }

    static async create(params, user) {
      const slug = params.slug || Document.slugify(params.title);
      const uniqueSlug = await dbAdapter.ensureUniqueDocumentSlug(slug, user.id);

      const visibility = ['public', 'protected', 'private'].includes(params.visibility) ? params.visibility : 'public';

      const id = await dbAdapter.createDocument({
        userId: user.id,
        title: params.title || '',
        slug: uniqueSlug,
        body: params.body || '',
        parentId: params.parentId || null,
        isPublished: params.isPublished !== false,
        visibility,
      });

      const object = await dbAdapter.getDocumentById(id);

      if (params.tags && params.tags.length > 0) {
        const tagPromises = params.tags.map((tag) => dbAdapter.addDocumentTag(id, tag));
        await Promise.all(tagPromises);
        object.tags = [...params.tags];
      }

      return object;
    }

    async update(params) {
      const updateData = {};

      if (params.title !== undefined) {
        updateData.title = params.title;
      }

      if (params.slug !== undefined) {
        const slug = Document.slugify(params.slug);
        const existing = await dbAdapter.getDocumentByUserAndSlug(this.userId, slug);

        if (existing && existing.id !== this.id) {
          throw Object.assign(new Error(`Slug "${slug}" is already taken`), { status: 409 });
        }

        updateData.slug = slug;
      }
      if (params.body !== undefined) {
        updateData.body = params.body;
      }

      if (params.parentId !== undefined) {
        updateData.parentId = params.parentId;
      }
      if (params.isPublished !== undefined) {
        updateData.isPublished = params.isPublished;
      }

      if (params.visibility !== undefined && ['public', 'protected', 'private'].includes(params.visibility)) {
        updateData.visibility = params.visibility;
      }
      if (Object.keys(updateData).length > 0) {
        const updated = await dbAdapter.updateDocument(this.id, updateData);
        Object.assign(this, updated);
      }

      // Update tags if provided (replace all)
      if (params.tags !== undefined) {
        const removePromises = this.tags.map((tag) => dbAdapter.removeDocumentTag(this.id, tag));
        const addPromises = params.tags.map((tag) => dbAdapter.addDocumentTag(this.id, tag));
        await Promise.all([...removePromises, ...addPromises]);
        this.tags = [...params.tags];
      }

      return this;
    }

    async addTag(tag) {
      await dbAdapter.addDocumentTag(this.id, tag);

      if (!this.tags.includes(tag)) {
        this.tags.push(tag);
      }
    }

    async removeTag(tag) {
      await dbAdapter.removeDocumentTag(this.id, tag);
      this.tags = this.tags.filter((t) => t !== tag);
    }

    async destroy() {
      await dbAdapter.deleteDocument(this.id);
    }



    async getChildren() {
      return await dbAdapter.getDocumentChildren(this.id);
    }

    async getParent() {
      if (!this.parentId) {
        return null;
      }

      return await dbAdapter.getDocumentById(this.parentId);
    }

    static slugify(text) {
      if (!text) return 'untitled';

      // Extended transliteration: Cyrillic (ru/uk/be), Arabic/Farsi, Turkish, Hebrew
      const MAP = {
        // Cyrillic basic
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'a', 'Б': 'b', 'В': 'v', 'Г': 'g', 'Д': 'd', 'Е': 'e', 'Ё': 'e',
        'Ж': 'zh', 'З': 'z', 'И': 'i', 'Й': 'y', 'К': 'k', 'Л': 'l', 'М': 'm',
        'Н': 'n', 'О': 'o', 'П': 'p', 'Р': 'r', 'С': 's', 'Т': 't', 'У': 'u',
        'Ф': 'f', 'Х': 'kh', 'Ц': 'ts', 'Ч': 'ch', 'Ш': 'sh', 'Щ': 'shch',
        'Ъ': '', 'Ы': 'y', 'Ь': '', 'Э': 'e', 'Ю': 'yu', 'Я': 'ya',

        // Ukrainian & Belarusian (within \u0400-\u04FF)
        'ґ': 'g', 'є': 'ye', 'і': 'i', 'ї': 'yi', 'ў': 'u',
        'Ґ': 'g', 'Є': 'ye', 'І': 'i', 'Ї': 'yi', 'Ў': 'u',

        // Turkish
        'ğ': 'g', 'ü': 'u', 'ş': 's', 'ı': 'i', 'ö': 'o', 'ç': 'c',
        'Ğ': 'g', 'Ü': 'u', 'Ş': 's', 'İ': 'i', 'Ö': 'o', 'Ç': 'c',

        // Arabic / Farsi
        'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ب': 'b', 'پ': 'p',
        'ت': 't', 'ث': 's', 'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh',
        'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's',
        'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a',
        'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'گ': 'g', 'ل': 'l',
        'م': 'm', 'ن': 'n', 'و': 'v', 'ه': 'h', 'ة': 'h', 'ی': 'y',
        'ي': 'y', 'ئ': 'a', 'ء': '', 'ك': 'k',

        // Hebrew
        'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v',
        'ז': 'z', 'ח': 'kh', 'ט': 't', 'י': 'y', 'ך': 'kh', 'כ': 'kh',
        'ל': 'l', 'ם': 'm', 'מ': 'm', 'ן': 'n', 'נ': 'n', 'ס': 's',
        'ע': 'a', 'ף': 'f', 'פ': 'f', 'ץ': 'ts', 'צ': 'ts', 'ק': 'k',
        'ר': 'r', 'ש': 'sh', 'ת': 't',
      };

      // Also normalize Latin-extended chars (Turkish, German etc) to ASCII
      const LATIN_MAP = {
        'ü': 'u', 'Ü': 'u', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g',
        'ı': 'i', 'İ': 'i', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c',
        'ä': 'a', 'Ä': 'a', 'ë': 'e', 'Ë': 'e', 'ï': 'i', 'Ï': 'i',
        'ñ': 'n', 'Ñ': 'n', 'é': 'e', 'É': 'e', 'è': 'e', 'È': 'e',
        'ê': 'e', 'Ê': 'e', 'â': 'a', 'Â': 'a', 'ô': 'o', 'Ô': 'o',
        'û': 'u', 'Û': 'u',
      };
      const latinRe = /[\x80-\xFF]/g;
      const step1 = text.replace(latinRe, (c) => LATIN_MAP[c] || c);

      const re = new RegExp('[' +
        '\u0400-\u04FF' +  // Cyrillic
        '\u0500-\u052F' +  // Cyrillic Supplement
        '\u0590-\u05FF' +  // Hebrew
        '\u0600-\u06FF' +  // Arabic
        '\u0750-\u077F' +  // Arabic Supplement
        '\u08A0-\u08FF' +  // Arabic Extended-A
      ']', 'g');

      const transliterated = step1.replace(re, (c) => MAP[c] || '');

      return (
        transliterated
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .replace(/-+/g, '-')
          .substring(0, 200) || 'untitled'
      );
    }
  };
}
